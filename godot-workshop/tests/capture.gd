extends SceneTree

func _initialize() -> void:
	call_deferred("_capture")

func _capture() -> void:
	var app = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(app)
	for i in range(8):
		await process_frame
	await RenderingServer.frame_post_draw
	var prefix := OS.get_environment("WORKSHOP_CAPTURE_PREFIX")
	if prefix.is_empty():
		prefix = "user://workshop"
	root.get_texture().get_image().save_png(prefix + "-entry.png")
	app.password_input.text = "0923"
	app._submit_password()
	for i in range(20):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-room.png")
	app.player.set_active(false)
	app.queue_free()
	await process_frame
	quit()
