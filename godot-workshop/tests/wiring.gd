extends SceneTree
var failed := false
func check(value: bool, message: String) -> void:
	if not value:
		failed = true
		push_error(message)
func _initialize() -> void:
	call_deferred("_run")
func _run() -> void:
	var w := WorkshopWiring.new()
	w.persistence = false
	root.add_child(w)
	check(w.available("standard") == 120 and w.available("long") == 9, "Exact initial stock")
	w.take("standard")
	check(w.available("standard") == 119, "Held wire reserves one")
	w.take("long")
	check(w.available("long") == 9, "Cannot duplicate held wires")
	w.insert(0)
	w.tighten(0)
	w.return_held()
	check(not w.held.is_empty(), "A tightened partial endpoint cannot be refunded")
	w.tighten(0)
	var partial: Variant = JSON.parse_string(JSON.stringify(w.state()))
	w.return_held()
	check(w.available("standard") == 120, "Returning a partial wire refunds stock")
	check(w.restore(partial) and w.held.a == 0 and w.available("standard") == 119, "JSON restores partial work")
	w.insert(0)
	check(w.installed.is_empty(), "Reject same/occupied endpoint")
	w.insert(7)
	check(w.installed.size() == 1 and w.available("standard") == 119 and w.held.is_empty(), "Two ends consume exactly one")
	w.tighten(0); w.tighten(7)
	w.remove_wire(0)
	check(w.installed.size() == 1, "Tight screws prevent removal")
	w.tighten(0); w.tighten(7); w.remove_wire(0)
	check(w.available("standard") == 120, "Removing refunds one")
	w.undo()
	check(w.installed.size() == 1 and w.available("standard") == 119, "Undo conserves inventory")
	var copy := w.state()
	check(w.restore(JSON.parse_string(JSON.stringify(copy))), "Completed work JSON roundtrip")
	var bad := copy.duplicate(true)
	bad.installed.append(bad.installed[0].duplicate(true))
	check(not w.restore(bad) and w.installed.size() == 1, "Reject overlapping corrupt save without changing work")
	for kind in ["standard", "long"]:
		var p := WorkshopWiring.wire_points(Vector3(0, 0.8, 0), Vector3(0.2, 0.8, 0.1), WorkshopWiring.LENGTH[kind])
		var distance := 0.0
		for i in range(1, p.size()):
			distance += p[i].distance_to(p[i - 1])
		check(absf(distance - WorkshopWiring.LENGTH[kind]) < 0.002, "Wire arc length stays fixed: " + kind)
	w.take("long"); w.return_held()
	check(w.available("long") == 9, "Long wire stock independent")
	w.queue_free()
	await process_frame
	if not failed:
		print("PASS: 120+9 inventory, hold/return, insertion, screws, occupancy, undo, JSON restoration, corrupt saves, fixed wire lengths")
	quit(1 if failed else 0)
