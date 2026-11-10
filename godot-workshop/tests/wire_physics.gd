extends SceneTree
var failed := false
func check(value: bool, message: String) -> void:
	if not value:
		failed = true
		push_error(message)
func floor_at(_p: Vector3) -> float:
	return 0.0
func tabletop(p: Vector3) -> float:
	return 0.753 if absf(p.x)<0.775 and absf(p.z)<0.6 else 0.0
func _initialize() -> void:
	call_deferred("_run")
func _run() -> void:
	var rope := WorkshopWireRope.new()
	rope.initialize(Vector3(0,1.5,0),Vector3.RIGHT,1.2)
	check(rope.points[-1].distance_to(Vector3(1.2,1.5,0)) < 0.001, "New wire starts extended, not coiled")
	rope.anchors(Vector3(0,1.5,0),Vector3.ZERO,false)
	for i in range(180):rope.step(1.0/60,floor_at)
	check(rope.points[-1].y < 0.5, "Unattached end falls under gravity")
	check(rope.points[0].distance_to(Vector3(0,1.5,0)) < 0.00001, "Held end remains fixed")
	check(absf(rope.arc_length()-1.2)<0.018,"Hanging wire retains its length within solver tolerance")
	rope.initialize(Vector3(0,1.6,0),Vector3.RIGHT,1.2)
	rope.anchors(Vector3(0,1.6,0),Vector3(0.6,1.6,0),true)
	for i in range(240):rope.step(1.0/60,floor_at)
	check(rope.points[15].y < 1.3, "Wire sags between two connected ends")
	check(rope.points[-1].distance_to(Vector3(0.6,1.6,0))<0.00001,"Second fixed end remains attached")
	check(absf(rope.arc_length()-1.2)<0.018,"Two-anchor wire retains its length")
	var dropped_y := rope.points[15].y
	rope.grab_index = 15
	rope.grab_position = Vector3(0.3,1.8,0)
	rope.sleeping = false
	for i in range(120):rope.step(1.0/60,floor_at)
	check(rope.points[15].distance_to(rope.grab_position)<0.00001,"Grabbed middle follows temporary pin")
	check(rope.points[0].distance_to(rope.anchor_a)<0.00001 and rope.points[-1].distance_to(rope.anchor_b)<0.00001,"Dragging never dislodges connected ends")
	check(absf(rope.arc_length()-1.2)<0.018,"Dragging preserves wire length")
	rope.grab_index = -1
	rope.sleeping = false
	for i in range(180):rope.step(1.0/60,floor_at)
	check(rope.points[15].y<1.3 and absf(rope.points[15].y-dropped_y)<0.08,"Released middle falls again")
	var long_wire := WorkshopWireRope.new()
	long_wire.initialize(Vector3(0,1.5,0),Vector3.RIGHT,4.0)
	long_wire.anchors(Vector3(0,1.5,0),Vector3.ZERO,false)
	for i in range(360):long_wire.step(1.0/60,floor_at)
	check(long_wire.points[-1].y<0.01 and absf(long_wire.arc_length()-4.0)<0.06,"Long wire rests on floor without losing length")
	rope.initialize(Vector3(0,0.81,0),Vector3.RIGHT,1.2)
	rope.anchors(Vector3(0,0.81,0),Vector3(0.3,0.81,0),true)
	for i in range(240):rope.step(1.0/60,tabletop)
	for point in rope.points:
		check(point.y >= tabletop(point)+0.0014,"Wire must not penetrate table or floor")
	check(rope.sleeping,"Resting wires stop recalculating")
	var saved: Variant = JSON.parse_string(JSON.stringify(rope.shape()))
	var other := WorkshopWireRope.new()
	other.initialize(Vector3(0,0.81,0),Vector3.RIGHT,1.2)
	check(other.load_shape(saved),"Settled shape survives JSON save/load")
	check(other.points[15].distance_to(rope.points[15]) < 0.00001,"Reload preserves physical shape")
	rope.anchors(Vector3(0,1.6,0),Vector3(.6,1.6,0),true)
	check(not rope.sleeping,"Moving an endpoint wakes a sleeping wire")
	check(not other.load_shape([[0,0,0]]),"Malformed shapes are rejected")
	if not failed:
		print("PASS: straight start, gravity, free end, two fixed ends, length, table/floor support, sleeping, wake-up, middle grab/release, long wire and saved physical shape")
	quit(1 if failed else 0)
