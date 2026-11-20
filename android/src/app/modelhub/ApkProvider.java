package app.modelhub;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;

/**
 * 只对外暴露缓存目录里的 update.apk，供系统安装器读取。
 * 自己写一个最小实现，避免依赖 androidx 的 FileProvider。
 */
public class ApkProvider extends ContentProvider {
    public static final String AUTHORITY = "app.modelhub.files";
    private static final String NAME = "update.apk";

    @Override
    public boolean onCreate() {
        return true;
    }

    private File target() {
        return new File(getContext().getCacheDir(), NAME);
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws java.io.FileNotFoundException {
        File f = target();
        if (!f.exists()) throw new java.io.FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f = target();
        String[] cols = projection != null ? projection : new String[]{"_display_name", "_size"};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            String k = cols[i];
            if (OpenableColumns.DISPLAY_NAME.equals(k) || "_display_name".equals(k)) row[i] = NAME;
            else if (OpenableColumns.SIZE.equals(k) || "_size".equals(k)) row[i] = f.length();
            else row[i] = null;
        }
        c.addRow(row);
        return c;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
