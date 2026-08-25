// app.config.js
//
// Dynamic Expo config: everything lives in app.json, except the Android
// application id, which is overridable via EXPO_PUBLIC_ANDROID_PACKAGE.
//
// Why: Google registers an Android OAuth client against a GLOBALLY UNIQUE
// (package name + signing SHA-1) pair. Two developers can't both use
// `io.tether.wdkshowcase` — the second gets a 403 because the pair is already
// bound to someone else's project. If you're testing Google Drive backup, set
// EXPO_PUBLIC_ANDROID_PACKAGE to your own value (e.g. io.tether.wdkshowcase.<you>)
// and register an OAuth client for it. See CLOUD-BACKUP.md.
//
// Left blank, it falls back to the canonical io.tether.wdkdoctor from app.json,
// so the app builds and runs unchanged if you're not testing Google backup.
//
// (iOS needs no override here: the CloudKit backup uses the web-services flow,
// which reads EXPO_PUBLIC_CLOUDKIT_CONTAINER_ID + API token at runtime.)

module.exports = ({ config }) => {
  config.android.package = process.env.EXPO_PUBLIC_ANDROID_PACKAGE || config.android.package;
  return config;
};
