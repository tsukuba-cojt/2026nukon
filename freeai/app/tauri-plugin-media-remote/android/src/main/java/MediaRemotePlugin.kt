package com.nukon.mediaremote

import android.app.Activity
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.session.MediaSession
import android.media.session.PlaybackState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class StartRemoteArgs {
    lateinit var channel: Channel
}

@TauriPlugin
class MediaRemotePlugin(private val activity: Activity) : Plugin(activity) {
    private var channel: Channel? = null
    private var session: MediaSession? = null
    private var silentTrack: AudioTrack? = null

    @Command
    fun startRemote(invoke: Invoke) {
        val args = invoke.parseArgs(StartRemoteArgs::class.java)
        channel = args.channel

        try {
            startSilentTrack()
            startSession()
            invoke.resolve()
        } catch (error: Exception) {
            invoke.reject("メディアセッションを開始できませんでした: $error")
        }
    }

    @Command
    fun stopRemote(invoke: Invoke) {
        channel = null
        session?.release()
        session = null
        silentTrack?.stop()
        silentTrack?.release()
        silentTrack = null
        invoke.resolve()
    }

    private fun emit(action: String) {
        val activeChannel = channel ?: return
        val event = JSObject()
        event.put("action", action)
        event.put("at", System.currentTimeMillis())
        activeChannel.send(event)
    }

    private fun startSession() {
        if (session != null) return

        val mediaSession = MediaSession(activity, "study-glass-media-remote")
        mediaSession.setCallback(object : MediaSession.Callback() {
            override fun onPlay() {
                emit("play")
                setPlaying(mediaSession)
            }

            override fun onPause() {
                emit("pause")
                setPlaying(mediaSession)
            }

            override fun onSkipToNext() {
                emit("next")
                setPlaying(mediaSession)
            }

            override fun onSkipToPrevious() {
                emit("previous")
                setPlaying(mediaSession)
            }
        })
        setPlaying(mediaSession)
        mediaSession.isActive = true
        session = mediaSession
    }

    private fun setPlaying(mediaSession: MediaSession) {
        mediaSession.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or
                        PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_PLAY_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS
                )
                .setState(PlaybackState.STATE_PLAYING, 0, 1.0f)
                .build()
        )
    }

    // Loops one second of silence so the session keeps media-button routing.
    private fun startSilentTrack() {
        if (silentTrack != null) return

        val sampleRate = 8000
        val samples = ShortArray(sampleRate)
        val track = AudioTrack(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
            AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build(),
            samples.size * 2,
            AudioTrack.MODE_STATIC,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        )
        track.write(samples, 0, samples.size)
        track.setLoopPoints(0, samples.size, -1)
        track.play()
        silentTrack = track
    }
}
