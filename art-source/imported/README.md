# Uploaded workwear character

`workwear_character.blend`와 `workwear_character.glb`는 사용자가 제공한 원본 그대로 보존합니다. 제공 GLB는 125개 메시와 17개 재질, 두 패치 텍스처를 가진 고정 A포즈 모델이며 뼈대와 애니메이션은 없습니다.

`workwear_character_rigged.blend`와 게임의 `assets/character/workwear-character-rigged.glb`는 파생본입니다. Blender의 -Y 정면을 작업실의 +Y 정면으로 돌리고 20개 변형 관절과 네 동작을 추가합니다. 메시의 정지 형태는 신발 외에는 바꾸지 않습니다. 신발 24개 구성요소만 사용자의 추가 요청에 따라 둥근 앞코·발등·발목 테두리·밑창·끈으로 재구성하며 원래 신발 재질을 유지합니다. 원본의 촬영용 바닥과 조명은 게임 모델에 포함하지 않습니다.

머리·목·얼굴·머리카락과 어깨 패치는 이름을 구분해 1인칭에서 숨깁니다. 장갑은 원래의 손가락 모양을 유지한 채 손 관절에 연결합니다. 개별 손가락 애니메이션은 없습니다.

재생성 (Blender 4.3.2에서 검증):

```sh
blender --disable-autoexec -b --factory-startup --python-exit-code 1 --python scripts/rig-imported-character.py
python3 scripts/verify-imported-character.py
```

검증 스크립트는 개발 도구로 NumPy, SciPy, Pillow를 사용합니다. 원본 GLB와 파생본의 101개 몸 메시 위치, 17개 재질 값과 패치 이미지 픽셀을 비교하고 신발 수정 여부를 확인합니다. 실행 사용자에게 Blender나 Python은 필요 없습니다.
