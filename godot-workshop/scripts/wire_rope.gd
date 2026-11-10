class_name WorkshopWireRope
extends RefCounted

const RADIUS := 0.0015
var points := PackedVector3Array()
var previous := PackedVector3Array()
var length_m := 1.2
var segment := 0.04
var anchor_a := Vector3.ZERO
var anchor_b := Vector3.ZERO
var pin_b := false
var grab_index := -1
var grab_position := Vector3.ZERO
var sleeping := false
var quiet_ticks := 0

func initialize(a: Vector3, direction: Vector3, wire_length: float) -> void:
	length_m = wire_length
	var count := clampi(ceili(length_m / 0.04) + 1, 12, 129)
	segment = length_m / (count - 1)
	anchor_a = a
	points.resize(count)
	if direction.length() < 0.001:
		direction = Vector3.FORWARD
	var side := direction.cross(Vector3.UP).normalized()
	if side.length() < 0.1:
		side = Vector3.RIGHT
	for i in range(count):
		points[i] = a + direction.normalized() * (i * segment) + side * (sin(i * 1.618) * 0.00005 if i > 0 else 0.0)
	previous = points.duplicate()
	sleeping = false
	quiet_ticks = 0

func anchors(a: Vector3, b: Vector3, second_pinned: bool) -> void:
	if anchor_a.distance_to(a) > 0.00001 or anchor_b.distance_to(b) > 0.00001 or pin_b != second_pinned:
		sleeping = false
		quiet_ticks = 0
	anchor_a = a
	anchor_b = b
	pin_b = second_pinned

func step(delta: float, floor_at: Callable) -> void:
	for substep in range(2):
		_substep(delta * 0.5, floor_at)

func _substep(delta: float, floor_at: Callable) -> void:
	if sleeping:
		return
	var dt := minf(delta, 1.0 / 30)
	var before := points.duplicate()
	for i in range(1, points.size()):
		if (pin_b and i == points.size() - 1) or i == grab_index:
			continue
		var p := points[i]
		points[i] += (p - previous[i]) * 0.98 + Vector3(0, -9.81, 0) * dt * dt
		previous[i] = p
	for iteration in range(36):
		_pin()
		# Alternate sweeps distribute corrections to both fixed endpoints.
		for k in range(points.size() - 1):
			var i := k if iteration % 2 == 0 else points.size() - 2 - k
			var j := i + 1
			var diff := points[j] - points[i]
			var distance := diff.length()
			if distance < 0.000001:
				diff = Vector3(0.0001, 0, 0.0001)
				distance = diff.length()
			var wi := 0.0 if i == 0 or i == grab_index else 1.0
			var wj := 0.0 if (pin_b and j == points.size() - 1) or j == grab_index else 1.0
			if wi + wj == 0:
				continue
			var correction := diff * ((distance - segment) / distance / (wi + wj))
			points[i] += correction * wi
			points[j] -= correction * wj
		# A small bend-radius constraint prevents a compressed wire folding into
		# sharp alternating corners when it lands on a flat surface.
		for i in range(points.size() - 2):
			var j := i + 2
			var bend := points[j] - points[i]
			var distance := bend.length()
			var minimum := segment * 1.65
			if distance < minimum and distance > 0.000001:
				var wi := 0.0 if i == 0 or i == grab_index else 1.0
				var wj := 0.0 if (pin_b and j == points.size() - 1) or j == grab_index else 1.0
				var correction := bend * ((distance - minimum) / distance / maxf(1.0, wi + wj)) * 0.35
				points[i] += correction * wi
				points[j] -= correction * wj
		if iteration % 4 == 3:
			_collide(floor_at)
	_pin()
	_collide(floor_at)
	var movement := 0.0
	for i in range(points.size()):
		movement = maxf(movement, before[i].distance_to(points[i]))
	if movement < 0.00015 and absf(arc_length() - length_m) < length_m * 0.015:
		quiet_ticks += 1
	else:
		quiet_ticks = 0
	if quiet_ticks >= 40:
		sleeping = true

func _pin() -> void:
	points[0] = anchor_a
	previous[0] = anchor_a
	if pin_b:
		points[points.size() - 1] = anchor_b
		previous[points.size() - 1] = anchor_b
	if grab_index > 0 and grab_index < points.size()-1:
		points[grab_index] = grab_position
		previous[grab_index] = grab_position

func _collide(floor_at: Callable) -> void:
	for i in range(1, points.size()):
		if (pin_b and i == points.size() - 1) or i == grab_index:
			continue
		var p := points[i]
		p.x = clampf(p.x, -2.97, 2.97)
		p.z = clampf(p.z, -2.77, 2.77)
		var floor_y: float = floor_at.call(p) + RADIUS
		if p.y < floor_y:
			p.y = floor_y
			previous[i].x = lerpf(previous[i].x, p.x, 0.35)
			previous[i].z = lerpf(previous[i].z, p.z, 0.35)
			previous[i].y = p.y
		points[i] = p

func arc_length() -> float:
	var value := 0.0
	for i in range(1, points.size()):
		value += points[i].distance_to(points[i - 1])
	return value

func shape() -> Array:
	var result := []
	for p in points:
		result.append([p.x, p.y, p.z])
	return result

func load_shape(data: Variant) -> bool:
	if not data is Array or data.size() != points.size():
		return false
	var candidate := PackedVector3Array()
	for item in data:
		if not item is Array or item.size() != 3:
			return false
		for value in item:
			if not (value is float or value is int) or not is_finite(float(value)) or absf(value) > 10:
				return false
		candidate.append(Vector3(item[0], item[1], item[2]))
	var arc := 0.0
	for i in range(1, candidate.size()):
		arc += candidate[i].distance_to(candidate[i - 1])
	if absf(arc - length_m) > length_m * 0.1:
		return false
	points = candidate
	previous = candidate.duplicate()
	return true
