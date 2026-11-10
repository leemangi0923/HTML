"""Create a self-contained Godot source ZIP without editor caches or user data."""
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
project = root / 'godot-workshop'
version_match = re.search(
    r'^config/version="([0-9]+\.[0-9]+\.[0-9]+)"$',
    (project / 'project.godot').read_text(encoding='utf-8'),
    re.MULTILINE,
)
if version_match is None:
    raise ValueError('Set config/version to MAJOR.MINOR.PATCH in project.godot before packaging')
version = version_match.group(1)
out = root / 'downloads' / f'task1-godot-v{version}.zip'
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
