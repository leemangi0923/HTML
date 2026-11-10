"""Create a self-contained Godot source ZIP without editor caches or user data."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
project = root / 'godot-workshop'
out = root / 'downloads' / 'task1-godot-starter.zip'
out.parent.mkdir(exist_ok=True)
with ZipFile(out, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(project.rglob('*')):
        if not file.is_file() or '.godot' in file.relative_to(project).parts:
            continue
        if file.name.endswith('.tmp'):
            continue
        info = ZipInfo(file.relative_to(project).as_posix(), date_time=(2026, 11, 10, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, file.read_bytes())
print(f'{out}: {out.stat().st_size:,} bytes')
