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
	app.work_view.zoom(3)
	await settle()
	for kind in ["standard", "long"]:
		if absf(app.wiring.stock_meshes[kind].get_instance_transform(0).basis.y.length()-WorkshopWiring.LENGTH[kind])>0.001:
			push_error("Rendered stock length mismatch: "+kind)
			quit(1)
			return
	root.get_texture().get_image().save_png(prefix+"-stock.png")
	app.work_view.focus_section(3)
	await click_at(Vector3(1.02,0.98,0.36))
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
	await create_timer(3.0).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-relay.png")
	app.work_view.focus_section(0)
	await settle()
	var entry: Dictionary = app.wiring.connection_nodes.values()[0]
	var rope: WorkshopWireRope = entry.rope
	var before: Dictionary = app.wiring.state()
	var count: int = app.wiring.available("standard")
	Input.warp_mouse(app.work_view.camera.unproject_position(rope.points[15]))
	await settle()
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.shift_pressed = true
	app.work_view._unhandled_input(press)
	if app.wiring.dragged_rope != rope:
		push_error("Shift+mouse did not grab connected wire")
		quit(1)
		return
	var index := rope.grab_index
	var held_at: Vector3 = rope.points[index]
	Input.warp_mouse(app.work_view.camera.unproject_position(held_at+Vector3(0.06,0,0.04)))
	await process_frame
	var motion := InputEventMouseMotion.new()
	app.work_view._unhandled_input(motion)
	await create_timer(1.0).timeout
	if rope.points[index].distance_to(held_at)<0.02:
		push_error("Wire middle failed to follow mouse")
		quit(1)
		return
	press.pressed = false
	app.work_view._unhandled_input(press)
	await create_timer(2.0).timeout
	if app.wiring.dragged_rope != null or rope.grab_index != -1 or app.wiring.available("standard") != count:
		push_error("Drop must release temporary pin and preserve inventory")
		quit(1)
		return
	if rope.points[0].distance_to(app.wiring.terminals[tb])>0.00001 or rope.points[-1].distance_to(app.wiring.terminals[relay])>0.00001:
		push_error("Dressing must keep terminal ends fixed")
		quit(1)
		return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix+"-dressed.png")
	app.wiring.undo()
	var restored: Dictionary = app.wiring.state()
	if restored.installed[0].shape != before.installed[0].shape:
		push_error("Undo must restore shape before dressing")
		quit(1)
		return
	print("PASS: Shift+drag, release, fixed ends, inventory, shape undo; rendered work overview and zoom, actual mouse-ray stock picking and real TB-to-relay wiring")
	app.player.set_active(false)
	app.queue_free()
	await process_frame
	quit()
