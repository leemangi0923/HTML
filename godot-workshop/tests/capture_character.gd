extends SceneTree

func _initialize() -> void:
	call_deferred("_capture")

func _capture() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("bfc8c7")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("e5e9e5")
	environment.ambient_light_energy = 0.6
	world.environment = environment
	stage.add_child(world)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-40, -150, 0)
	light.light_energy = 0.8
	light.shadow_enabled = true
	stage.add_child(light)
	var floor_mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(10, 10)
	floor_mesh.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("bac4c1")
	mat.roughness = 1
	floor_mesh.material_override = mat
	stage.add_child(floor_mesh)
	var avatar := WorkshopAvatar.new()
	stage.add_child(avatar)
	print("CLIPS: ", avatar.animation_player.get_animation_list())
	print("BONES: ", avatar.skeleton.get_bone_count(), " HIDDEN FP MESHES: ", avatar.first_person_hidden.size())
	var camera := Camera3D.new()
	camera.cull_mask = 3
	camera.position = Vector3(0, 0.95, -2.7)
	camera.fov = 43
	stage.add_child(camera)
	camera.look_at(Vector3(0, 0.88, 0))
	camera.current = true
	var prefix := OS.get_environment("WORKSHOP_CAPTURE_PREFIX")
	if prefix.is_empty():
		prefix = "user://character"
	for i in range(15):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-front.png")
	camera.position = Vector3(-2.7, 0.95, 0)
	camera.look_at(Vector3(0, 0.88, 0))
	for i in range(5):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-left.png")
	avatar.set_motion(0, true)
	for i in range(30):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-crouch.png")
	camera.position = Vector3(0.45, 0.30, -0.65)
	camera.look_at(Vector3(0, 0.08, -0.02))
	avatar.set_motion(0, false)
	await create_timer(0.4).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(prefix + "-shoes.png")
	stage.queue_free()
	await process_frame
	quit()
