class_name WorkshopPlayer
extends CharacterBody3D

signal inspect_requested(camera: Camera3D)
signal focus_lost

const SPAWN := Vector3(0, 0.05, 1.35)
const WALK_SPEED := 1.3
const RUN_SPEED := 1.9
const CROUCH_SPEED := 0.8
const SENSITIVITY := 0.0024
var active := false
var head: Node3D
var camera: Camera3D
var capsule: CapsuleShape3D
var avatar: WorkshopAvatar
var collider: CollisionShape3D
var step_phase := 0.0
var camera_bob := Vector2.ZERO
var workbench: Node3D
var working_pose := false
var work_view := false

func _ready() -> void:
	name = "Player"
	capsule = CapsuleShape3D.new()
	capsule.radius = 0.20
	capsule.height = 1.70
	collider = CollisionShape3D.new()
	collider.shape = capsule
	collider.position.y = 0.85
	add_child(collider)
	head = Node3D.new()
	head.name = "Head"
	head.position = Vector3(0, 1.60, -0.18)
	head.rotation.x = -0.50
	add_child(head)
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.current = true
	camera.fov = 72
	camera.cull_mask = 5
	camera.near = 0.03
	camera.far = 35
	head.add_child(camera)
	avatar = WorkshopAvatar.new()
	add_child(avatar)
	reset_position()

func set_active(value: bool) -> void:
	active = value
	velocity.x = 0
	velocity.z = 0
	for action in ["move_left", "move_right", "move_forward", "move_back", "crouch", "run"]:
		Input.action_release(action)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if active else Input.MOUSE_MODE_VISIBLE

func reset_position() -> void:
	position = SPAWN
	rotation = Vector3.ZERO
	velocity = Vector3.ZERO
	step_phase = 0.0
	camera_bob = Vector2.ZERO
	if is_instance_valid(head):
		head.rotation = Vector3(-0.50, 0, 0)
		head.position = Vector3(0, 1.60, -0.18)

func _unhandled_input(event: InputEvent) -> void:
	if not active:
		return
	if event is InputEventMouseMotion and not work_view:
		rotate_y(-event.relative.x * SENSITIVITY)
		head.rotation.x = clampf(head.rotation.x - event.relative.y * SENSITIVITY, -1.53, 1.15)
	if event.is_action_pressed("inspect"):
		inspect_requested.emit(get_viewport().get_camera_3d())

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= 9.8 * delta
	var crouched := active and Input.is_action_pressed("crouch")
	var desired_height := 1.12 if crouched else 1.60
	capsule.height = 1.20 if crouched else 1.70
	collider.position.y = capsule.height * 0.5
	var axis := Input.get_vector("move_left", "move_right", "move_forward", "move_back") if active and not work_view else Vector2.ZERO
	var direction := (transform.basis * Vector3(axis.x, 0, axis.y)).normalized()
	var speed := CROUCH_SPEED if crouched else RUN_SPEED if Input.is_action_pressed("run") else WALK_SPEED
	velocity.x = move_toward(velocity.x, direction.x * speed, delta * 9.0)
	velocity.z = move_toward(velocity.z, direction.z * speed, delta * 9.0)
	move_and_slide()
	var actual_speed := Vector2(velocity.x, velocity.z).length() if active else 0.0
	var target_bob := Vector2.ZERO
	if active and is_on_floor() and actual_speed > 0.08:
		step_phase += actual_speed * delta * TAU / (0.50 if crouched else 0.83)
		var strength := minf(actual_speed / WALK_SPEED, 1.0) * (0.55 if crouched else 1.0)
		target_bob = Vector2(sin(step_phase) * 0.0025, cos(step_phase * 2.0) * 0.004) * strength
	camera_bob = camera_bob.lerp(target_bob, 1.0 - exp(-12.0 * delta))
	head.position.x = camera_bob.x
	head.position.y = lerpf(head.position.y, desired_height + camera_bob.y, 1.0 - exp(-14.0 * delta))
	avatar.look_pitch = head.rotation.x
	working_pose = false # Empty left hand stays relaxed; right-arm reach is object-driven.
	avatar.set_motion(actual_speed, crouched, global_basis.inverse() * velocity, delta, working_pose)
	if position.y < -2:
		reset_position()

func _near_workbench() -> bool:
	if not is_instance_valid(workbench) or head.rotation.x > -0.35:
		return false
	# The table is 1.55 x 1.30 m, centered at (0, 0, 0.05) in Workbench space.
	var at := workbench.to_local(global_position)
	var closest := Vector3(clampf(at.x, -0.775, 0.775), at.y, clampf(at.z, -0.60, 0.70))
	var toward := workbench.global_basis * (closest - at)
	if toward.length() > 0.42 or toward.length() < 0.05:
		return false
	return (-global_basis.z).dot(toward.normalized()) > 0.65

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_WINDOW_FOCUS_OUT and active:
		set_active(false)
		focus_lost.emit()
