package com.nukon.glasscamera

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

// Android support for the Meta Wearables Device Access Toolkit is not wired
// up yet; commands reject so the frontend can fall back to other capture modes.
@TauriPlugin
class GlassCameraPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun startGlass(invoke: Invoke) {
        invoke.reject("グラスカメラのAndroid対応は未実装です。")
    }

    @Command
    fun stopGlass(invoke: Invoke) {
        invoke.resolve()
    }

    @Command
    fun capturePhoto(invoke: Invoke) {
        invoke.reject("グラスカメラのAndroid対応は未実装です。")
    }

    @Command
    fun startRegistration(invoke: Invoke) {
        invoke.reject("グラスカメラのAndroid対応は未実装です。")
    }

    @Command
    fun registrationState(invoke: Invoke) {
        val response = JSObject()
        response.put("state", "unsupported")
        invoke.resolve(response)
    }

    @Command
    fun handleUrl(invoke: Invoke) {
        invoke.resolve()
    }
}
