"""把 aapt2 在 Windows 上打出的反斜杠路径修成正斜杠（安卓只认 /），并保证 resources.arsc 不压缩。"""
import sys
import zipfile

src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zi, zipfile.ZipFile(dst, 'w') as zo:
    for it in zi.infolist():
        name = it.filename.replace(chr(92), '/')
        stored = name == 'resources.arsc' or name.endswith('.png')
        zi_out = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
        zo.writestr(zi_out, zi.read(it.filename), compress_type=zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
