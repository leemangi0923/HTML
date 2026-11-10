extends SceneTree
var failed := false
func check(value: bool, message: String) -> void:
	if not value:
		failed = true
		push_error(message)
func ticks(n: int) -> void:
	for i in range(n):
		await physics_frame
func _initialize() -> void:
	call_deferred("_run")
func _run() -> void:
	var app = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(app)
	app.wiring.persistence = false
	app.wiring.restore({"schema":1,"installed":[],"held":{}})
	app.password_input.text = "0923"
	app._submit_password()
	await ticks(8)
	var view: WorkshopWorkView = app.work_view
	var w: WorkshopWiring = app.wiring
	check(w.terminals.size() == 357, "12 legacy and 345 real panel terminals")
	check(w.terminal_keys.find("R1.13") >= 12 and w.terminal_keys.find("PLC.P01") >= 12, "Use actual pin identifiers")
	var tab := InputEventKey.new()
	tab.physical_keycode = KEY_TAB
	tab.pressed = true
	Input.parse_input_event(tab)
	await ticks(2)
	check(view.camera.current and app.player.work_view and not app.player.camera.current, "Work camera becomes active")
	check(view.camera.cull_mask == 1 and app.player.camera.cull_mask == 5, "Close view excludes body while walking view retains it")
	var spawn: Vector3 = app.player.position
	Input.action_press("move_forward")
	await ticks(12)
	Input.action_release("move_forward")
	check(app.player.position.distance_to(spawn) < 0.001, "Work view must not move the physical body")
	var initial: float = view.camera.size
	view.zoom(0.5)
	check(view.camera.size < initial, "Wheel zoom enlarges the panel")
	view.pan(Vector2(100,100))
	check(view.camera.position.x != view.CENTERS[0].x, "Middle drag pans the work view")
	view.focus_section(3)
	check(view.section == 3, "Supplies have a direct work camera position")
	app._show_pause()
	app._resume()
	check(Input.mouse_mode == Input.MOUSE_MODE_VISIBLE, "Resuming in work view retains the free cursor")
	var legacy := {"schema":1,"installed":[{"kind":"standard","a":0,"b":7,"tight_a":true,"tight_b":false}],"held":{}}
	check(w.restore(JSON.parse_string(JSON.stringify(legacy))) and w.installed[0].a == 0 and w.available("standard") == 119, "Migrate v0.6 legacy wire indices without consuming extra stock")
	w.restore({"schema":1,"installed":[],"held":{}})
	var tb: int = w.terminal_keys.find("TB.1.t")
	var bottom: int = w.terminal_keys.find("TB.1.b")
	var relay: int = w.terminal_keys.find("R1.13")
	w.take("standard");w.insert(tb)
	var before_preview: Vector3 = app.player.position
	await ticks(12)
	check(app.player.position.distance_to(before_preview) < 0.001, "A partial wire in work view must not tether or teleport the body")
	w.insert(relay)
	check(not w.connected(bottom,relay), "Loose ends are excluded from connection tracing")
	var cached_node: Node3D = w.connection_nodes.values()[0].node
	w.tighten(tb);w.tighten(relay)
	check(w.connection_nodes.values()[0].node == cached_node, "Tightening reuses wire geometry")
	check(w.connected(bottom,relay), "Real TB internal bridge and tightened wire form a path")
	var snapshot: Dictionary = w.state()
	snapshot.terminal_keys[0] = "TEST.X2.t"
	snapshot.terminal_keys[1] = "TEST.X1.t"
	check(w.restore(JSON.parse_string(JSON.stringify(snapshot))), "New saves map named pins to current indices")
	w.tighten(relay)
	check(not w.connected(bottom,relay), "Loosening a screw breaks the traced path")
	# All 129 supplied wires can be represented without inventing extra stock.
	var bulk := {"schema":2,"terminal_keys":w.terminal_keys.duplicate(),"installed":[],"held":{}}
	for i in range(129):
		bulk.installed.append({"kind":"standard" if i<120 else "long","a":i*2,"b":i*2+1,"tight_a":false,"tight_b":false})
	check(w.restore(bulk) and w.available("standard") == 0 and w.available("long") == 0, "Exact 120+9 stock supports the full terminal set")
	w.take("long")
	check(w.held.is_empty(), "Exhausted long stock cannot spawn a wire")
	bulk.installed.append({"kind":"standard","a":258,"b":259,"tight_a":false,"tight_b":false})
	check(not w.restore(bulk), "Reject the 121st standard wire")
	app._reset()
	check(not view.enabled and app.player.camera.current, "Reset restores first-person walking camera")
	app.player.set_active(false)
	app.queue_free()
	await process_frame
	if not failed:
		print("PASS: work camera, zoom, pan, body masks, pause/resume, 345 panel pins, real connection tracing, save mapping and exact stock limits")
	quit(1 if failed else 0)
