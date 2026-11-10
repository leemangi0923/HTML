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
	await create_timer(0.45).timeout
	await RenderingServer.frame_post_draw
	var prefix := OS.get_environment("WORKSHOP_CAPTURE_PREFIX")
	if prefix.is_empty():
		prefix = "user://player"
	root.get_texture().get_image().save_png(prefix + "-standing.png")
	app.player.position = Vector3(0, 0.01, 0.94)
	app.player.head.rotation.x = -1.15
	await create_timer(0.45).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-working.png")
	Input.action_press("crouch")
	await create_timer(0.55).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-crouching.png")
	Input.action_release("crouch")
	app.player.set_active(false)
	app.queue_free()
	await process_frame
	quit()
