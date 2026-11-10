class_name TrainingWorkshop
extends Node3D

const PlayerScript = preload("res://scripts/player.gd")
const BenchScript = preload("res://scripts/workbench.gd")
var player: WorkshopPlayer
var gate: PanelContainer
var pause_menu: PanelContainer
var password_input: LineEdit
var error_label: Label
var hint_label: Label
var help_label: Label
var crosshair: Label
var logged_in := false
var wiring: WorkshopWiring

func _ready() -> void:
	_install_inputs()
	_build_room()
	var bench := Node3D.new()
	bench.set_script(BenchScript)
	add_child(bench)
	player = PlayerScript.new()
	player.workbench = bench
	add_child(player)
	player.inspect_requested.connect(_inspect)
	player.focus_lost.connect(_show_pause)
	_build_interface()
	wiring = WorkshopWiring.new()
	wiring.player = player
	add_child(wiring)

func _install_inputs() -> void:
	var bindings := {"move_forward": [KEY_W, KEY_UP], "move_back": [KEY_S, KEY_DOWN], "move_left": [KEY_A, KEY_LEFT], "move_right": [KEY_D, KEY_RIGHT], "run": [KEY_SHIFT], "crouch": [KEY_C], "inspect": [KEY_E], "pause": [KEY_ESCAPE], "reset": [KEY_R], "tighten": [KEY_F], "return_wire": [KEY_Q], "remove_wire": [KEY_X], "undo_wire": [KEY_Z]}
	for action in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for code in bindings[action]:
			var event := InputEventKey.new()
			event.physical_keycode = code
			InputMap.action_add_event(action, event)

func _room_box(at: Vector3, size: Vector3, color: Color, label_text: String) -> void:
	var body := StaticBody3D.new()
	body.position = at
	body.set_meta("label", label_text)
	var mesh := MeshInstance3D.new()
	var cube := BoxMesh.new()
	cube.size = size
	mesh.mesh = cube
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.85
	mesh.material_override = mat
	body.add_child(mesh)
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	add_child(body)

func _build_room() -> void:
	var environment := WorldEnvironment.new()
	var settings := Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color("cbd4d7")
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("e7eef1")
	settings.ambient_light_energy = 0.28
	environment.environment = settings
	add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -25, 0)
	sun.light_color = Color("fff3de")
	sun.light_energy = 0.42
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 10.0
	sun.shadow_bias = 0.1
	sun.shadow_normal_bias = 1.0
	add_child(sun)
	for x in [-1.2, 1.2]:
		var fill := OmniLight3D.new()
		fill.position = Vector3(x, 2.5, 1.2)
		fill.omni_range = 5.0
		fill.light_energy = 0.24
		add_child(fill)
	_room_box(Vector3(0, -0.05, 0), Vector3(6, 0.10, 5.6), Color("aeb7b5"), "작업실 바닥")
	_room_box(Vector3(0, 1.5, -2.8), Vector3(6, 3, 0.10), Color("d6ddda"), "작업실 벽")
	_room_box(Vector3(0, 1.5, 2.8), Vector3(6, 3, 0.10), Color("d6ddda"), "작업실 벽")
	_room_box(Vector3(-3, 1.5, 0), Vector3(0.10, 3, 5.6), Color("c7d1d0"), "작업실 벽")
	_room_box(Vector3(3, 1.5, 0), Vector3(0.10, 3, 5.6), Color("c7d1d0"), "작업실 벽")
	for x in range(-6, 7):
		_room_box(Vector3(x * 0.5, 0.001, 0), Vector3(0.002, 0.001, 5.6), Color("97a4a3"), "")
	for z in range(-5, 6):
		_room_box(Vector3(0, 0.001, z * 0.5), Vector3(6, 0.001, 0.002), Color("97a4a3"), "")
	for x in [-1.9, -0.65, 0.65, 1.9]:
		_room_box(Vector3(x, 1.95, -2.735), Vector3(1.0, 0.75, 0.015), Color("85a2b2"), "창문")

func _label(text: String, size := 18) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

func _button(text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 44)
	button.pressed.connect(callback)
	return button

func _card(parent: Control, size: Vector2) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.position = -size / 2
	panel.size = size
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.15, 0.16, 0.96)
	style.set_corner_radius_all(14)
	style.content_margin_left = 28
	style.content_margin_right = 28
	style.content_margin_top = 26
	style.content_margin_bottom = 26
	panel.add_theme_stylebox_override("panel", style)
	parent.add_child(panel)
	return panel

func _build_interface() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var ui := Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Malgun Gothic", "Noto Sans CJK KR", "Noto Sans KR", "Arial"])
	theme.default_font = font
	theme.default_font_size = 18
	ui.theme = theme
	layer.add_child(ui)
	var hud_top := ColorRect.new()
	hud_top.color = Color(0.03, 0.10, 0.11, 0.78)
	hud_top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	hud_top.offset_bottom = 104
	hud_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(hud_top)
	var hud_bottom := ColorRect.new()
	hud_bottom.color = Color(0.03, 0.10, 0.11, 0.78)
	hud_bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	hud_bottom.offset_top = -55
	hud_bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(hud_bottom)
	var version := str(ProjectSettings.get_setting("application/config/version"))
	var title := _label("1과제 작업실 · 준비된 전선 · v" + version, 21)
	title.position = Vector2(24, 20)
	title.size = Vector2(600, 30)
	ui.add_child(title)
	var controls := _label("WASD 이동 · C 앉기 · E 집기/삽입 · F 조임/풀기 · Q 반납 · X 분리 · Z 되돌리기 · Esc 메뉴", 16)
	controls.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	controls.offset_left = 24
	controls.offset_top = -42
	controls.offset_right = -24
	controls.offset_bottom = -12
	ui.add_child(controls)
	hint_label = _label("비밀번호를 입력하면 작업실에 들어가요.", 18)
	hint_label.position = Vector2(24, 59)
	hint_label.size = Vector2(950, 30)
	ui.add_child(hint_label)
	crosshair = _label("+", 22)
	crosshair.set_anchors_preset(Control.PRESET_CENTER)
	crosshair.position = Vector2(-8, -16)
	crosshair.size = Vector2(20, 32)
	crosshair.visible = false
	ui.add_child(crosshair)
	gate = _card(ui, Vector2(440, 330))
	var login := VBoxContainer.new()
	login.add_theme_constant_override("separation", 14)
	gate.add_child(login)
	login.add_child(_label("작업실 입장", 27))
	login.add_child(_label("3D 작업실 비밀번호를 입력해 주세요."))
	password_input = LineEdit.new()
	password_input.placeholder_text = "비밀번호"
	password_input.secret = true
	password_input.max_length = 4
	password_input.custom_minimum_size = Vector2(0, 46)
	password_input.text_submitted.connect(func(_text: String): _submit_password())
	login.add_child(password_input)
	error_label = _label("", 15)
	error_label.add_theme_color_override("font_color", Color("ffb5a3"))
	error_label.custom_minimum_size.y = 24
	login.add_child(error_label)
	login.add_child(_button("작업실 들어가기", _submit_password))
	password_input.grab_focus.call_deferred()
	pause_menu = _card(ui, Vector2(460, 360))
	var menu := VBoxContainer.new()
	menu.add_theme_constant_override("separation", 12)
	pause_menu.add_child(menu)
	menu.add_child(_label("잠깐 쉬는 중", 27))
	menu.add_child(_button("계속하기", _resume))
	menu.add_child(_button("작업대 앞으로 돌아오기", _reset))
	menu.add_child(_button("조작법", _toggle_help))
	help_label = _label("WASD / 방향키로 이동, 마우스로 둘러보기\nC 낮추기 · E 전선 집기/삽입 · F 조임/풀기\nQ 반납 · X 분리 · Z 되돌리기 · Esc 메뉴", 16)
	help_label.visible = false
	menu.add_child(help_label)
	menu.add_child(_button("종료", func(): get_tree().quit()))
	pause_menu.visible = false

func _submit_password() -> void:
	if password_input.text != "0923":
		error_label.text = "비밀번호가 맞지 않아요. 다시 입력해 주세요."
		password_input.select_all()
		password_input.grab_focus()
		return
	password_input.text = ""
	logged_in = true
	gate.hide()
	_resume()

func _resume() -> void:
	pause_menu.hide()
	crosshair.show()
	player.set_active(true)
	hint_label.text = "오른쪽 재료대에서 E로 전선을 집으세요. 작업대 앞 X1~X6에 E로 삽입, F로 조이기. C로 낮춰 작업해요."

func _show_pause() -> void:
	if not logged_in:
		return
	player.set_active(false)
	crosshair.hide()
	pause_menu.show()

func _reset() -> void:
	player.reset_position()
	_resume()

func _toggle_help() -> void:
	help_label.visible = not help_label.visible

func _unhandled_input(event: InputEvent) -> void:
	if not logged_in:
		return
	if event.is_action_pressed("pause"):
		if pause_menu.visible:
			_resume()
		else:
			_show_pause()
		get_viewport().set_input_as_handled()
	if player.active:
		if event.is_action_pressed("return_wire"):
			hint_label.text = wiring.return_held()
		if event.is_action_pressed("undo_wire"):
			wiring.undo()
		if event.is_action_pressed("tighten"):
			_wire_action("tighten")
		if event.is_action_pressed("remove_wire"):
			_wire_action("remove")
	if event.is_action_pressed("reset"):
		_reset()

func _aim(camera: Camera3D) -> Dictionary:
	var start := camera.global_position
	var query := PhysicsRayQueryParameters3D.create(start, start - camera.global_basis.z * 2.2)
	query.exclude = [player.get_rid()]
	return get_world_3d().direct_space_state.intersect_ray(query)

func _reachable(point: Vector3) -> bool:
	var rig := player.avatar.skeleton
	var shoulder := rig.to_global(rig.get_bone_global_pose(rig.find_bone("UpperArm.R")).origin)
	return shoulder.distance_to(point) < 0.60

func _wire_action(action: String) -> void:
	var hit := _aim(player.camera)
	if hit.is_empty() or not hit.collider.has_meta("terminal"):
		hint_label.text = "작업대 앞 X1~X6 단자에 조준해 주세요."
		return
	if not _reachable(hit.position):
		hint_label.text = "손이 닿지 않아요. 조금 가까이 가거나 C로 자세를 낮춰주세요."
		return
	player.avatar.reach_to(hit.position + Vector3(0, 0.04, 0))
	var id := int(hit.collider.get_meta("terminal"))
	hint_label.text = wiring.tighten(id) if action == "tighten" else wiring.remove_wire(id)

func _inspect(from_camera: Camera3D) -> void:
	var hit := _aim(from_camera)
	if hit.is_empty():
		hint_label.text = "재료대나 단자를 화면 가운데에 두세요."
		return
	var object: Object = hit.collider
	if object.has_meta("terminal") or object.has_meta("supply"):
		if not _reachable(hit.position):
			hint_label.text = "손이 닿지 않아요. 조금 가까이 가거나 C로 자세를 낮춰주세요."
			return
		player.avatar.reach_to(hit.position + Vector3(0, 0.04, 0))
		hint_label.text = wiring.take(str(object.get_meta("supply"))) if object.has_meta("supply") else wiring.insert(int(object.get_meta("terminal")))
	else:
		hint_label.text = str(object.get_meta("label", "작업대"))
