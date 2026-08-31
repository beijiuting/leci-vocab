package com.leci.vocab;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {

    // 通过 https 域名映射本地 assets：IndexedDB / 相对路径行为与普通网站一致，存储更可靠
    private static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int REQ_FILE = 7101;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private int ttsCounter = 0;
    private boolean ttsPendingUk = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(bgColor());
        setContentView(webView);
        applyEdgeToEdge();

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // IndexedDB：学习进度
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= 33) {
            try { s.setAlgorithmicDarkeningAllowed(true); } catch (Throwable ignored) {}
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                // 站内资源就地加载，外部链接交给系统浏览器
                if ((scheme.equals("http") || scheme.equals("https"))
                        && !uri.getHost().equals("appassets.androidplatform.net")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Throwable ignored) {}
                    return true;
                }
                return false;
            }
        });

        /* WebView 默认不会替 HTML file input 打开系统选择器，交给 SAF 处理 */
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                              FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("text/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "text/plain", "text/csv", "application/json", "text/comma-separated-values"});
                try {
                    startActivityForResult(intent, REQ_FILE);
                    return true;
                } catch (Throwable ignored) {
                    filePathCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });

        webView.addJavascriptInterface(new TtsBridge(), "NativeTTS");
        webView.addJavascriptInterface(new BackupBridge(), "NativeBackup");
        initTts();
        requestLegacyRead();   // 卸载重装后读下载目录的自动备份（Android 12 及以下）

        webView.loadUrl(START_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || filePathCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) result = new Uri[]{uri};
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }

    private static final int REQ_READ = 7001;

    /* 首次启动请求一次媒体读取权限：允许后 MediaStore 才能看到旧安装留下的自动备份 */
    private void requestLegacyRead() {
        String perm = Build.VERSION.SDK_INT >= 33
                ? android.Manifest.permission.READ_MEDIA_IMAGES
                : android.Manifest.permission.READ_EXTERNAL_STORAGE;
        if (checkSelfPermission(perm) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{perm}, REQ_READ);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == REQ_READ && webView != null && results.length > 0
                && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            webView.evaluateJavascript("window.App&&App.retryAutoRestore&&App.retryAutoRestore()", null);
        }
    }

    /* ---- edge-to-edge：网页内容避让状态栏/手势条，WebView 底色与页面背景一致 ---- */
    private void applyEdgeToEdge() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            webView.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets sys = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(sys.left, sys.top, sys.right, sys.bottom);
                return WindowInsets.CONSUMED;
            });
            webView.requestApplyInsets();   // 首次分发可能早于监听器挂载，手动补一次
        } else {
            w.setStatusBarColor(Color.parseColor("#4A7DF7"));
        }
    }

    private int bgColor() {
        return getResources().getColor(R.color.app_bg, getTheme());
    }

    /* ---- 系统 TTS 桥：WebView 里 speechSynthesis 不可用，交给原生引擎 ---- */
    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            ttsReady = (status == TextToSpeech.SUCCESS);
            if (ttsReady) applyTtsLang(ttsPendingUk);
        });
    }

    private void applyTtsLang(boolean uk) {
        if (!ttsReady) return;
        int r = tts.setLanguage(uk ? Locale.UK : Locale.US);
        if (r < 0) tts.setLanguage(Locale.SIMPLIFIED_CHINESE); // 引擎缺英文语音时的兜底
    }

    private class TtsBridge {

        @JavascriptInterface
        public boolean available() {
            return ttsReady;
        }

        @JavascriptInterface
        public void speak(String text, final boolean uk) {
            if (!ttsReady || text == null || text.length() == 0) return;
            ttsPendingUk = uk;
            applyTtsLang(uk);
            final String id = "tts" + (ttsCounter++);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
        }

        @JavascriptInterface
        public void stop() {
            if (ttsReady) tts.stop();
        }
    }

    /* ---- 备份桥：WebView 里 blob 下载和文件选择都不可用，
            导出改走「剪贴板 + 下载目录」，导入走剪贴板/粘贴 ---- */
    private String onUiSync(Callable<Void> job) {
        final CountDownLatch latch = new CountDownLatch(1);
        runOnUiThread(() -> {
            try { job.call(); } catch (Throwable ignored) {} finally { latch.countDown(); }
        });
        try { latch.await(2, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        return null;
    }

    /** 在指定媒体集合里找同名文件（取最新的那份），没有返回 null。
        前缀匹配：Images 集合插入 json 名时系统会自动补 .jpg 扩展名；
        历史遗留的旧副本顺带清理，避免读到过期空备份 */
    private Uri mediaUri(Uri collection, String name) {
        try {
            Cursor c = getContentResolver().query(collection,
                    new String[]{MediaStore.MediaColumns._ID},
                    MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?", new String[]{name + "%"},
                    "_id DESC");
            if (c != null) {
                Uri uri = null;
                if (c.moveToFirst()) uri = ContentUris.withAppendedId(collection, c.getLong(0));
                while (c.moveToNext()) {
                    try { getContentResolver().delete(ContentUris.withAppendedId(collection, c.getLong(0)), null, null); } catch (Throwable ignored2) {}
                }
                c.close();
                return uri;
            }
        } catch (Throwable ignored) {}
        return null;
    }

    /** 找到公共下载目录里本应用写的同名文件，没有返回 null（Android 10+） */
    private Uri downloadsUri(String name) {
        if (Build.VERSION.SDK_INT < 29) return null;
        return mediaUri(MediaStore.Downloads.EXTERNAL_CONTENT_URI, name);
    }

    /** 自动备份的媒体集合副本（Pictures/乐词备份）：卸载后行仍在（owner 置空），
        重装并授予媒体读取权限后跨应用可见，卸载重装也能自动继承进度 */
    private Uri autoBakImageUri() {
        if (Build.VERSION.SDK_INT < 29) return null;
        return mediaUri(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, AUTO_BAK_NAME);
    }

    /** 把自动备份写入媒体集合（同名覆盖），返回是否成功 */
    private boolean saveToImages(String json) {
        if (Build.VERSION.SDK_INT < 29) return false;
        OutputStream os = null;
        try {
            Uri uri = autoBakImageUri();
            if (uri == null) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, AUTO_BAK_NAME);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, AUTO_BAK_DIR);
                uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
            }
            if (uri == null) return false;
            os = getContentResolver().openOutputStream(uri, "wt");
            if (os == null) return false;
            os.write(json.getBytes("UTF-8"));
            os.close();
            os = null;
            return true;
        } catch (Throwable ignored) {
            return false;
        } finally {
            if (os != null) { try { os.close(); } catch (Throwable ignored2) {} }
        }
    }

    private String saveToDownloads(String name, String json) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                Uri uri = downloadsUri(name);   // 同名覆盖，避免 (1) 副本
                if (uri == null) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                }
                if (uri == null) return null;
                try (OutputStream os = getContentResolver().openOutputStream(uri, "wt")) {
                    if (os == null) return null;
                    os.write(json.getBytes("UTF-8"));
                }
                return Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath();
            }
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, name);
            try (FileOutputStream os = new FileOutputStream(f)) { os.write(json.getBytes("UTF-8")); }
            return f.getAbsolutePath();
        } catch (Throwable t) {
            return null;    // 老版本无存储权限等：仅剪贴板兜底
        }
    }

    private static final String AUTO_BAK_NAME = "乐词自动备份.json";
    private static final String AUTO_BAK_FILE = "autobackup.json";
    private static final String AUTO_BAK_DIR = "Pictures/乐词备份";

    /** 找到公共下载目录里本应用写的自动备份，没有返回 null（Android 10+） */
    private Uri autoBakUri() {
        return downloadsUri(AUTO_BAK_NAME);
    }

    private class BackupBridge {

        /** 返回给 JS 的 toast 文案 */
        @JavascriptInterface
        public String save(final String name, final String json) {
            if (json == null || json.length() == 0) return "备份内容为空";
            onUiSync(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("leci", json));
                return null;
            });
            String path = saveToDownloads(name == null || name.length() == 0 ? "leci-backup.json" : name, json);
            if (path != null) return "已复制到剪贴板，并保存到下载目录";
            return "已复制到剪贴板";
        }

        @JavascriptInterface
        public String clip() {
            final String[] out = {""};
            onUiSync(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip() != null) {
                    CharSequence t = cm.getPrimaryClip().getItemAt(0).getText();
                    out[0] = t == null ? "" : t.toString();
                }
                return null;
            });
            return out[0];
        }

        /** 自动备份：私有文件（覆盖安装保留）+ 媒体集合副本（卸载重装可读）+ 下载目录（用户可见），静默执行 */
        @JavascriptInterface
        public void saveAuto(final String json) {
            if (json == null || json.length() == 0) return;
            try (FileOutputStream os = new FileOutputStream(new File(getFilesDir(), AUTO_BAK_FILE))) {
                os.write(json.getBytes("UTF-8"));
            } catch (Throwable ignored) {}
            saveToImages(json);
            if (Build.VERSION.SDK_INT >= 29) {
                OutputStream os = null;
                try {
                    Uri uri = autoBakUri();
                    File flag = new File(getFilesDir(), "dl_written");
                    if (uri == null && flag.exists()) {
                        return;   // 旧行因卸载变为无主而不可见：跳过，避免每次刷新都插出 (n) 副本
                    }
                    if (uri != null) {
                        os = getContentResolver().openOutputStream(uri, "wt");
                    } else {
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.MediaColumns.DISPLAY_NAME, AUTO_BAK_NAME);
                        cv.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                        cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                        uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (uri != null) os = getContentResolver().openOutputStream(uri);
                    }
                    if (os != null) {
                        os.write(json.getBytes("UTF-8"));
                        os.close();
                        os = null;
                        try { flag.createNewFile(); } catch (Throwable ignored2) {}
                    }
                } catch (Throwable ignored) {
                } finally {
                    if (os != null) { try { os.close(); } catch (Throwable ignored2) {} }
                }
            }
        }

        /** 读自动备份：先私有文件，再媒体集合副本，最后下载目录；都没有返回空串 */
        @JavascriptInterface
        public String readAuto() {
            try {
                File f = new File(getFilesDir(), AUTO_BAK_FILE);
                if (f.exists() && f.length() > 0) {
                    return readStream(new FileInputStream(f));
                }
            } catch (Throwable ignored) {}
            Uri[] candidates = { autoBakImageUri(), autoBakUri() };
            for (Uri uri : candidates) {
                try {
                    if (uri == null) continue;
                    InputStream in = getContentResolver().openInputStream(uri);
                    if (in != null) {
                        String s = readStream(in);
                        if (s.length() > 0) return s;
                    }
                } catch (Throwable ignored) {}
            }
            return "";
        }

        private String readStream(InputStream in) {
            try {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                return bo.toString("UTF-8");
            } catch (Throwable ignored) {
                return "";
            } finally {
                try { in.close(); } catch (Throwable ignored2) {}
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (tts != null && ttsReady) {
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {}
                @Override public void onDone(String utteranceId) { notifyTtsEnd(); }
                @Override public void onError(String utteranceId) { notifyTtsEnd(); }
            });
        }
    }

    private void notifyTtsEnd() {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.__nativeTtsEnd&&window.__nativeTtsEnd()", null);
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Throwable ignored) {} }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
