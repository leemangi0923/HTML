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
	var spawn: Vector3 = app.player.position
	Input.action_press("move_forward")
	await wait_ticks(130)
	Input.action_release("move_forward")
	check(app.player.position.z < spawn.z - 0.2, "WASD must move the player")
	check(app.player.position.z >= 0.885, "Player must not cross the workbench collider")
	Input.action_press("crouch")
	await wait_ticks(25)
	check(app.player.head.position.y < 1.2, "Crouch must lower the eye height")
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
		print("PASS: entry, WASD, floor, workbench collision, crouch, pause, reset and 19 devices")
	else:
		print("FAIL: ", failures)
	app.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
