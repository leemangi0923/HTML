extends SceneTree
var app
func _initialize() -> void:
	call_deferred("_run")
func settle() -> void:
	await create_timer(0.4).timeout
	await RenderingServer.frame_post_draw
func click_at(point: Vector3) -> void:
	Input.warp_mouse(app.work_view.camera.unproject_position(point))
	await settle()
	app._inspect(app.work_view.camera)
func _run() -> void:
	app = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(app)
	app.wiring.persistence = false
	app.wiring.restore({"schema":1,"installed":[],"held":{}})
	app.password_input.text = "0923"
	app._submit_password()
	app.work_view.set_enabled(true)
	await settle()
	var prefix := OS.get_environment("WORKSHOP_CAPTURE_PREFIX")
	root.get_texture().get_image().save_png(prefix + "-panel.png")
	app.work_view.focus_section(3)
	await click_at(Vector3(1.12,0.98,0.36))
	if app.wiring.held.is_empty():
		push_error("Work view supply picking failed: " + app.hint_label.text)
		quit(1)
		return
	app.work_view.focus_section(0)
	var tb: int = app.wiring.terminal_keys.find("TB.1.t")
	var relay: int = app.wiring.terminal_keys.find("R1.13")
	await click_at(app.wiring.terminals[tb])
	app._wire_action("tighten")
	var point: Vector3 = app.wiring.terminals[relay]
	app.work_view.camera.position.x = point.x
	app.work_view.camera.position.z = point.z
	app.work_view.camera.size = 0.16
	await click_at(point)
	app._wire_action("tighten")
	await settle()
	if not app.wiring.connected(tb,relay):
		push_error("Work view real terminal picking failed: " + app.hint_label.text)
		quit(1)
		return
	root.get_texture().get_image().save_png(prefix + "-relay.png")
	print("PASS: rendered work overview and zoom, actual mouse-ray stock picking and real TB-to-relay wiring")
	app.player.set_active(false)
	app.queue_free()
	await process_frame
	quit()
