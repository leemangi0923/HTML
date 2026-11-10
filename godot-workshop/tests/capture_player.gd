extends SceneTree
func _initialize() -> void:
	call_deferred("_capture")
func _capture() -> void:
	var app = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(app)
	for i in range(10):
		await process_frame
	app.password_input.text = "0923"
	app._submit_password()
	app.player.head.rotation.x = -1.50
	for i in range(20):
		await process_frame
	await RenderingServer.frame_post_draw
	var prefix := OS.get_environment("WORKSHOP_CAPTURE_PREFIX")
	if prefix.is_empty():
		prefix = "user://player"
	root.get_texture().get_image().save_png(prefix + "-standing.png")
	Input.action_press("crouch")
	for i in range(40):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-crouching.png")
	Input.action_release("crouch")
	app.player.set_active(false)
	app.queue_free()
	await process_frame
	quit()
