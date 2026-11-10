extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func check(value: bool, message: String) -> void:
	if not value:
		failures.append(message)
		push_error(message)

func wait_ticks(count: int) -> void:
	for i in range(count):
		await physics_frame

func _run() -> void:
	var packed: PackedScene = load("res://scenes/workshop.tscn")
	var app = packed.instantiate()
	root.add_child(app)
	await wait_ticks(10)
	check(not app.logged_in and not app.player.active, "Must start behind the entry screen")
	app.password_input.text = "0000"
	app._submit_password()
	check(not app.logged_in and not app.player.active, "Wrong password must not enable movement")
	app.password_input.text = "0923"
	app._submit_password()
	check(app.logged_in and app.player.active, "0923 must enable the workshop")
	await wait_ticks(8)
	check(app.player.is_on_floor(), "Player must settle on the floor")
	var avatar: WorkshopAvatar = app.player.avatar
	check(avatar.skeleton.get_bone_count() >= 18, "Character must have a real skeleton")
	check(avatar.body_meshes.size() > 10, "Character body must be visible geometry")
	check(avatar.first_person_hidden.size() > 2, "Head and shoulder badges must be identified")
	for hidden in avatar.first_person_hidden:
		check((hidden.layers & app.player.camera.cull_mask) == 0, "FP camera must hide " + hidden.name)
	var hip_index: int = avatar.skeleton.find_bone("Hips")
	var standing_hip: float = avatar.skeleton.get_bone_global_pose(hip_index).origin.y
	var eye_z: float = app.player.camera.global_position.z
	app.player.head.rotation.x = -1.50
	check(absf(app.player.camera.global_position.z - eye_z) < 0.001, "Looking down must not orbit the eye position")
	var spawn: Vector3 = app.player.position
	Input.action_press("move_forward")
	await wait_ticks(10)
	check(avatar.current_clip == "Walk", "Movement must select the walk animation")
	await wait_ticks(120)
	Input.action_release("move_forward")
	check(app.player.position.z < spawn.z - 0.2, "WASD must move the player")
	check(app.player.position.z >= 0.885, "Player must not cross the workbench collider")
	Input.action_press("crouch")
	await wait_ticks(25)
	check(app.player.head.position.y < 1.2, "Crouch must lower the eye height")
	check(avatar.current_clip == "CrouchIdle", "Crouching at rest must select crouch idle")
	var crouch_hip: Vector3 = avatar.skeleton.get_bone_global_pose(hip_index).origin
	check(crouch_hip.y < standing_hip - 0.20, "Crouch animation must lower the character, not just the camera")
	var knee: Vector3 = avatar.skeleton.get_bone_global_pose(avatar.skeleton.find_bone("Shin.L")).origin
	check(knee.z < crouch_hip.z - 0.10, "Crouching knees must bend forward")
	var ankle: Vector3 = avatar.skeleton.get_bone_global_pose(avatar.skeleton.find_bone("Foot.L")).origin
	check(ankle.y > 0.04 and ankle.y < 0.16, "Crouch feet must remain on the ground")
	Input.action_release("crouch")
	app._show_pause()
	var paused: Vector3 = app.player.position
	Input.action_press("move_left")
	await wait_ticks(20)
	check(absf(app.player.position.x - paused.x) < 0.001, "Menu must stop movement")
	app._reset()
	check(app.player.position.distance_to(WorkshopPlayer.SPAWN) < 0.001, "Reset must return to the workbench")
	check(app.player.active and not app.pause_menu.visible, "Reset must resume play")
	check(app.get_node("Workbench").layout.devices.size() == 19, "All 19 reference devices must exist")
	app.player.set_active(false)
	if failures.is_empty():
		print("PASS: entry, WASD, floor, workbench collision, crouch, pause, reset, 19 devices, skinned character, animations, knee direction and FP masks")
	else:
		print("FAIL: ", failures)
	app.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
