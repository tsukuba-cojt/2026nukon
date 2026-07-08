package com.nukon.photoinbox

import android.Manifest
import android.app.Activity
import android.content.ContentResolver
import android.content.ContentUris
import android.database.ContentObserver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.provider.MediaStore
import android.util.Base64
import app.tauri.Logger
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

@InvokeArg
class StartWatchingArgs {
    lateinit var channel: Channel
}

private const val ALIAS_PHOTOS = "photos"
private const val ALIAS_PHOTOS_LEGACY = "photosLegacy"
private const val MAX_EDGE_PX = 1600
private const val JPEG_QUALITY = 80
private const val SCAN_DEBOUNCE_MS = 400L
private const val TAG = "photo-inbox"

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.READ_MEDIA_IMAGES], alias = ALIAS_PHOTOS),
        Permission(strings = [Manifest.permission.READ_EXTERNAL_STORAGE], alias = ALIAS_PHOTOS_LEGACY)
    ]
)
class PhotoInboxPlugin(private val activity: Activity) : Plugin(activity) {
    private var channel: Channel? = null
    private var observer: ContentObserver? = null
    private var workerThread: HandlerThread? = null
    private var workerHandler: Handler? = null
    private var watchStartSeconds = 0L
    private val seenIds = HashSet<Long>()

    private val scanRunnable = Runnable { scanForNewImages() }

    private fun photosAlias(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ALIAS_PHOTOS
        } else {
            ALIAS_PHOTOS_LEGACY
        }
    }

    @Command
    fun startWatching(invoke: Invoke) {
        val args = invoke.parseArgs(StartWatchingArgs::class.java)
        channel = args.channel

        if (getPermissionState(photosAlias()) == PermissionState.GRANTED) {
            beginWatch(invoke)
        } else {
            requestPermissionForAlias(photosAlias(), invoke, "photosPermissionCallback")
        }
    }

    @PermissionCallback
    private fun photosPermissionCallback(invoke: Invoke) {
        if (getPermissionState(photosAlias()) == PermissionState.GRANTED) {
            beginWatch(invoke)
        } else {
            channel = null
            invoke.reject("Photo library permission was denied.")
        }
    }

    @Command
    fun stopWatching(invoke: Invoke) {
        teardownObserver()
        channel = null
        invoke.resolve()
    }

    private fun beginWatch(invoke: Invoke) {
        teardownObserver()

        watchStartSeconds = System.currentTimeMillis() / 1000
        seenIds.clear()

        val thread = HandlerThread("photo-inbox-watcher")
        thread.start()
        val handler = Handler(thread.looper)
        workerThread = thread
        workerHandler = handler

        val contentObserver = object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean) {
                // MediaStore fires several times per insert; debounce into one scan.
                handler.removeCallbacks(scanRunnable)
                handler.postDelayed(scanRunnable, SCAN_DEBOUNCE_MS)
            }
        }

        activity.contentResolver.registerContentObserver(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            true,
            contentObserver
        )
        observer = contentObserver

        invoke.resolve()
    }

    private fun teardownObserver() {
        observer?.let { activity.contentResolver.unregisterContentObserver(it) }
        observer = null
        workerHandler?.removeCallbacks(scanRunnable)
        workerHandler = null
        workerThread?.quitSafely()
        workerThread = null
    }

    private fun scanForNewImages() {
        val activeChannel = channel ?: return
        val resolver = activity.contentResolver

        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.DISPLAY_NAME
        )
        val selection = "${MediaStore.Images.Media.DATE_ADDED} >= ?"
        val selectionArgs = arrayOf(watchStartSeconds.toString())
        val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} ASC"

        try {
            resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val dateColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
                val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idColumn)
                    if (!seenIds.add(id)) continue

                    val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                    val imageDataUrl = readDownscaledJpegDataUrl(resolver, uri) ?: continue

                    val event = JSObject()
                    event.put("imageDataUrl", imageDataUrl)
                    event.put("takenAt", cursor.getLong(dateColumn) * 1000)
                    event.put("name", cursor.getString(nameColumn))
                    event.put("source", "android_media_store")
                    activeChannel.send(event)
                }
            }
        } catch (error: Exception) {
            Logger.error(TAG, "Failed to scan MediaStore for new images: $error", error)
        }
    }

    private fun readDownscaledJpegDataUrl(resolver: ContentResolver, uri: Uri): String? {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            val longEdge = max(bounds.outWidth, bounds.outHeight)
            if (longEdge <= 0) return null

            var sampleSize = 1
            while (longEdge / (sampleSize * 2) >= MAX_EDGE_PX) {
                sampleSize *= 2
            }

            val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
            val decoded = resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            } ?: return null

            val scale = MAX_EDGE_PX.toFloat() / max(decoded.width, decoded.height)
            val bitmap = if (scale < 1f) {
                val scaled = Bitmap.createScaledBitmap(
                    decoded,
                    max(1, (decoded.width * scale).roundToInt()),
                    max(1, (decoded.height * scale).roundToInt()),
                    true
                )
                if (scaled != decoded) decoded.recycle()
                scaled
            } else {
                decoded
            }

            val output = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)
            bitmap.recycle()

            "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
        } catch (error: Exception) {
            Logger.error(TAG, "Failed to read image $uri: $error", error)
            null
        }
    }
}
