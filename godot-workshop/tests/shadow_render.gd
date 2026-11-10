extends SceneTree

# Run with a real Compatibility renderer (e.g. DISPLAY=:91 godot ... --script tests/shadow_render.gd).+# A head can exist and have cast_shadow enabled yet be absent from the FP shadow map.
func _initialize() -> void:
	call_deferred("_run")

func _frame_image() -> Image:
	for i in range(5):
		await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func _brightness(image: Image, pixel: Vector2) -> float:
	var total := 0.0
	for y in range(-3, 4):
		for x in range(-3, 4):
			var color := image.get_pixel(int(pixel.x) + x, int(pixel.y) + y)
			total += (color.r + color.g + color.b) / 3.0
	return total / 49.0

func _run() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color.WHITE
	environment.environment.ambient_light_energy = 0.25
	stage.add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, -20, 0)
	sun.light_energy = 0.55
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 10
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.shadow_bias = 0.02
	sun.shadow_normal_bias = 0.05
	stage.add_child(sun)
	var floor_mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(12, 12)
	floor_mesh.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("888888")
	material.roughness = 1.0
	floor_mesh.material_override = material
	stage.add_child(floor_mesh)
	var avatar := WorkshopAvatar.new()
	stage.add_child(avatar)
	avatar.animation_player.pause()
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 5.0
	camera.far = 15
	camera.cull_mask = 5
	camera.position = Vector3(0, 6, 3)
	stage.add_child(camera)
	camera.look_at(Vector3(0, 0, 0.7))
	camera.current = true
	var with_head := await _frame_image()
	# Project the center of the head along the light ray onto the floor.
	var head := Vector3(0, 1.61, 0)
	var ray := -sun.global_basis.z
	var point := head + ray * (-head.y / ray.y)
	var pixel := camera.unproject_position(point)
	for shadow in avatar.head_shadow_meshes:
		shadow.visible = false
	var without_head := await _frame_image()
	var present := _brightness(with_head, pixel)
	var absent := _brightness(without_head, pixel)
	var prefix := OS.get_environment("WORKSHOP_CAPTURE_PREFIX")
	if not prefix.is_empty():
		with_head.save_png(prefix + "-head.png")
		without_head.save_png(prefix + "-no-head.png")
	var passed := absent > present + 0.08
	print("HEAD SHADOW: FP brightness with=", present, " without=", absent, " sample=", pixel)
	if passed:
		print("PASS: hidden head casts a visible shadow through the first-person camera")
	else:
		push_error("First-person head shadow is missing from the rendered floor")
	stage.queue_free()
	await process_frame
	quit(0 if passed else 1)
