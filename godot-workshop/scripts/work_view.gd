class_name WorkshopWorkView
extends Node3D

signal clicked(camera: Camera3D)
signal mode_changed(enabled: bool)
var player: WorkshopPlayer
var camera: Camera3D
var enabled := false
var section := 0
const CENTERS := [Vector3(-0.24, 1.8, -0.16), Vector3(0.345, 1.8, 0.055), Vector3(-0.24, 1.8, 0.355), Vector3(1.12, 1.8, 0.46)]
const SIZES := [0.75, 0.40, 0.32, 0.48]

func _ready() -> void:
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.near = 0.02
	camera.far = 5.0
	camera.cull_mask = 1
	camera.rotation.x = -PI / 2
	add_child(camera)
	focus_section(0)
	camera.current = false

func set_enabled(value: bool) -> void:
	enabled = value
	player.work_view = value
	player.velocity.x = 0
	player.velocity.z = 0
	if value:
		camera.current = true
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	else:
		player.camera.current = true
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if player.active else Input.MOUSE_MODE_VISIBLE
	mode_changed.emit(value)

func focus_section(index: int) -> void:
	section = clampi(index, 0, 3)
	camera.position = CENTERS[section]
	camera.size = SIZES[section]

func zoom(factor: float) -> void:
	camera.size = clampf(camera.size * factor, 0.08, 1.3)

func pan(pixels: Vector2) -> void:
	var scale_m := camera.size / maxf(1.0, get_viewport().get_visible_rect().size.y)
	camera.position.x -= pixels.x * scale_m
	camera.position.z -= pixels.y * scale_m
	camera.position.x = clampf(camera.position.x, -0.85, 1.5)
	camera.position.z = clampf(camera.position.z, -0.75, 0.8)

func _unhandled_input(event: InputEvent) -> void:
	if not player.active:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_TAB:
			set_enabled(not enabled)
			get_viewport().set_input_as_handled()
			return
		if enabled and event.physical_keycode >= KEY_1 and event.physical_keycode <= KEY_4:
			focus_section(event.physical_keycode - KEY_1)
			get_viewport().set_input_as_handled()
	if not enabled:
		return
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
		pan(event.relative)
		get_viewport().set_input_as_handled()
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom(0.82)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom(1.0 / 0.82)
		elif event.button_index == MOUSE_BUTTON_LEFT:
			clicked.emit(camera)
		else:
			return
		get_viewport().set_input_as_handled()
