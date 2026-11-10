extends SceneTree
var app
func _initialize() -> void:
	call_deferred("_run")
func settle() -> void:
	await create_timer(0.5).timeout
	await RenderingServer.frame_post_draw
func aim(at: Vector3) -> void:
	app.player.look_at(Vector3(at.x, app.player.global_position.y, at.z))
	app.player.head.look_at(at)
func _run() -> void:
	app = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(app)
	app.wiring.persistence = false
	app.wiring.restore({"schema":1,"installed":[],"held":{}})
	app.password_input.text = "0923"
	app._submit_password()
	Input.action_press("crouch")
	app.player.position = Vector3(1.12, 0.02, 0.88)
	await settle()
	aim(Vector3(1.12, 0.98, 0.36))
	await settle()
	app._inspect(app.player.camera)
	if app.wiring.held.is_empty():
		push_error("Supply ray interaction failed: " + app.hint_label.text)
		quit(1)
		return
	await settle()
	var prefix := OS.get_environment("WORKSHOP_CAPTURE_PREFIX")
	root.get_texture().get_image().save_png(prefix + "-supply.png")
	app.player.position = Vector3(0.34, 0.02, 0.94)
	Input.action_press("crouch")
	await settle()
	for id in [0, 7]:
		aim(app.wiring.terminals[id])
		await settle()
		app._inspect(app.player.camera)
		app._wire_action("tighten")
		await settle()
	if app.wiring.installed.size() != 1 or not app.wiring.installed[0].tight_a or not app.wiring.installed[0].tight_b:
		push_error("Terminal ray interaction failed: " + app.hint_label.text)
		quit(1)
		return
	root.get_texture().get_image().save_png(prefix + "-connected.png")
	print("PASS: actual camera rays pick stock, insert both ends and tighten both screws; rendered captures saved")
	Input.action_release("crouch")
	app.player.set_active(false)
	app.queue_free()
	await process_frame
	quit()
