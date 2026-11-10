# Character source assets

현재 실행 캐릭터는 [imported/README.md](imported/README.md)의 사용자 제공 모델과 그 파생본입니다. `scripts/rig-imported-character.py`가 게임용 관절/동작을 추가하고 `scripts/refine-character-shoes.py`가 요청받은 신발만 수정합니다.

기존 `student-uniform.blend`, `decals`, `scripts/build-godot-character.py`, `scripts/prepare-character-textures.py`는 초기 모델 제작 기록입니다. 현재 Godot 런타임에서는 이 모델과 옷감 덮어쓰기를 사용하지 않습니다.
