class_name WorkshopWiring
extends Node3D

signal changed
const TOTAL := {"standard": 120, "long": 9}
# Provisional physical lengths until the school's stock is measured.
const LENGTH := {"standard": 1.2, "long": 4.0}
var installed: Array = []
var held: Dictionary = {}
var history: Array = []
var terminals: Array[Vector3] = []
var visuals: Node3D
var preview: MeshInstance3D
var player: WorkshopPlayer
var status_label: Label3D
var save_path := "user://prepared-wires-v1.json"
var persistence := true
var wire_material: StandardMaterial3D

func _ready() -> void:
	name = "PreparedWires"
	wire_material = _mat(Color("e8b927"))
	visuals = Node3D.new()
	add_child(visuals)
	preview = MeshInstance3D.new()
	preview.material_override = wire_material
	add_child(preview)
	# Two physical supplies, on a separate waist-high stand to the right.
	var stand := _box(Vector3(1.12, 0.91, 0.46), Vector3(0.48, 0.06, 0.38), Color("40545a"))
	_hit(stand, {"label": "전선 재료대"}, Vector3(0.48, 0.06, 0.38))
	for x in [0.92, 1.32]:
		_box(Vector3(x, 0.45, 0.46), Vector3(0.025, 0.90, 0.025), Color("68777a"))
	for kind in ["standard", "long"]:
		var z := 0.36 if kind == "standard" else 0.56
		var supply := _box(Vector3(1.12, 0.96, z), Vector3(0.43, 0.04, 0.16), Color("263c43"))
		_hit(supply, {"supply": kind}, Vector3(0.43, 0.06, 0.16))
		for i in range(6 if kind == "standard" else 3):
			var points := PackedVector3Array()
			for j in range(65):
				var angle := j * TAU / 64
				points.append(Vector3(1.12 + cos(angle) * (0.15 - i * 0.004), 0.985 + i * 0.002, z + sin(angle) * 0.055))
			_tube(points, self)
	status_label = Label3D.new()
	status_label.position = Vector3(1.12, 1.15, 0.46)
	status_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Malgun Gothic", "Noto Sans CJK KR", "Arial"])
	status_label.font = font
	status_label.font_size = 30
	status_label.pixel_size = 0.0017
	add_child(status_label)
	# A dedicated six-way strip; top/bottom are the same physical terminal.
	_box(Vector3(0.34, 0.776, 0.51), Vector3(0.30, 0.04, 0.13), Color("252c30"))
	for row in range(2):
		for col in range(6):
			var at := Vector3(0.215 + col * 0.05, 0.805, 0.48 + row * 0.065)
			terminals.append(at)
			var socket := _box(at, Vector3(0.041, 0.012, 0.043), Color("6b7477"))
			_hit(socket, {"terminal": terminals.size() - 1}, Vector3(0.045, 0.025, 0.048))
			var label := Label3D.new()
			label.text = "X%d" % (col + 1)
			label.font_size = 25
			label.pixel_size = 0.0007
			label.rotation_degrees.x = -90
			label.position = at + Vector3(0, 0.008, 0)
			add_child(label)
	if persistence and FileAccess.file_exists(save_path):
		restore(JSON.parse_string(FileAccess.get_file_as_string(save_path)))
	refresh()

func _mat(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.65
	return m

func _box(at: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh.mesh = box
	mesh.material_override = _mat(color)
	mesh.position = at
	add_child(mesh)
	return mesh

func _hit(mesh: MeshInstance3D, metadata: Dictionary, size: Vector3) -> void:
	var body := StaticBody3D.new()
	for key in metadata:
		body.set_meta(key, metadata[key])
	var collider := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	collider.shape = box
	body.add_child(collider)
	mesh.add_child(body)

func available(kind: String) -> int:
	var count: int = TOTAL[kind]
	for wire in installed:
		if wire.kind == kind:
			count -= 1
	if held.get("kind", "") == kind:
		count -= 1
	return count

func state() -> Dictionary:
	return {"schema": 1, "installed": installed.duplicate(true), "held": held.duplicate(true)}

func restore(data: Variant) -> bool:
	if not data is Dictionary or data.get("schema") != 1 or not data.get("installed") is Array or not data.get("held") is Dictionary:
		return false
	var counts := {"standard": 0, "long": 0}
	var used := {}
	for wire in data.installed:
		if not wire is Dictionary or not _valid_wire(wire, true):
			return false
		for end in [wire.a, wire.b]:
			if used.has(end):
				return false
			used[end] = true
		counts[wire.kind] += 1
	if not data.held.is_empty():
		if not _valid_wire(data.held, false):
			return false
		if data.held.a >= 0 and used.has(data.held.a):
			return false
		counts[data.held.kind] += 1
	if counts.standard > 120 or counts.long > 9:
		return false
	installed = data.installed.duplicate(true)
	held = data.held.duplicate(true)
	return true

func _valid_wire(w: Dictionary, complete: bool) -> bool:
	if not TOTAL.has(w.get("kind", "")) or not w.get("a") is int or not w.get("b") is int:
		# JSON numbers are floats, normalize only exact integers.
		if not TOTAL.has(w.get("kind", "")) or not w.has_all(["a", "b"]):
			return false
		if not (w.a is float and w.a == floor(w.a) and w.b is float and w.b == floor(w.b)):
			return false
		w.a = int(w.a); w.b = int(w.b)
	if not w.get("tight_a") is bool or not w.get("tight_b") is bool:
		return false
	if not complete and (w.b != -1 or w.tight_b or (w.a == -1 and w.tight_a)):
		return false
	return w.a >= (0 if complete else -1) and w.a < 12 and w.b >= (0 if complete else -1) and w.b < 12 and (not complete or w.a != w.b)

func _before() -> void:
	history.append(state())
	if history.size() > 150:
		history.pop_front()

func take(kind: String) -> String:
	if not TOTAL.has(kind) or not held.is_empty():
		return "들고 있는 선부터 연결하거나 Q로 반납해 주세요."
	if available(kind) == 0:
		return "이 종류의 전선을 모두 사용했어요."
	_before()
	held = {"kind": kind, "a": -1, "b": -1, "tight_a": false, "tight_b": false}
	refresh()
	return "전선을 들었어요. 단자에 조준하고 E로 한쪽씩 꽂으세요."

func occupied(id: int) -> bool:
	for w in installed:
		if w.a == id or w.b == id:
			return true
	return held.get("a", -1) == id

func insert(id: int) -> String:
	if held.is_empty():
		return "오른쪽 재료대에서 전선을 먼저 집으세요."
	if id < 0 or id >= terminals.size() or occupied(id):
		return "이미 전선이 꽂힌 단자예요."
	if held.a >= 0 and terminals[held.a].distance_to(terminals[id]) > LENGTH[held.kind]:
		return "선 길이가 부족해요."
	_before()
	if held.a < 0:
		held.a = id
	else:
		held.b = id
		installed.append(held.duplicate(true))
		held.clear()
	refresh()
	return "삽입했어요. 각 단자에 조준하고 F로 나사를 조이세요."

func tighten(id: int) -> String:
	var wire: Dictionary = {}
	for w in installed:
		if w.a == id or w.b == id:
			wire = w
	if held.get("a", -1) == id:
		wire = held
	if wire.is_empty():
		return "먼저 전선 끝을 꽂으세요."
	_before()
	var key := "tight_a" if wire.a == id else "tight_b"
	wire[key] = not wire[key]
	refresh()
	return "나사를 조였어요." if wire[key] else "나사를 풀었어요."

func remove_wire(id: int) -> String:
	for i in range(installed.size()):
		var w: Dictionary = installed[i]
		if w.a != id and w.b != id:
			continue
		if w.tight_a or w.tight_b:
			return "양쪽 나사를 F로 먼저 풀어주세요."
		_before()
		installed.remove_at(i)
		refresh()
		return "전선을 빼서 재료대에 반납했어요."
	return "완전히 연결된 전선에 조준해 주세요."

func return_held() -> String:
	if held.is_empty():
		return "들고 있는 전선이 없어요."
	if held.tight_a:
		return "꽂힌 쪽 나사를 F로 풀어주세요."
	_before()
	held.clear()
	refresh()
	return "들고 있던 전선을 반납했어요."

func undo() -> void:
	if history.is_empty():
		return
	restore(history.pop_back())
	refresh()

func refresh() -> void:
	for child in visuals.get_children():
		child.free()
	for wire in installed:
		var points := wire_points(terminals[wire.a], terminals[wire.b], LENGTH[wire.kind])
		_tube(points, visuals)
		_end(terminals[wire.a], visuals, wire.tight_a)
		_end(terminals[wire.b], visuals, wire.tight_b)
	status_label.text = "준비된 전선\n일반 %d / 120\n긴 선 %d / 9\n조준 + E 집기" % [available("standard"), available("long")]
	if persistence:
		var file := FileAccess.open(save_path, FileAccess.WRITE)
		if file:
			file.store_string(JSON.stringify(state()))
	changed.emit()

static func wire_points(a: Vector3, b: Vector3, length_m: float) -> PackedVector3Array:
	var points := PackedVector3Array()
	var turns := maxi(1, ceili(length_m / 0.55))
	var low := 0.0
	var high := length_m
	for iteration in range(22):
		var radius := (low + high) * 0.5
		points.clear()
		for i in range(129):
			var t := i / 128.0
			var angle := t * TAU * turns
			var offset := Vector3(sin(angle), 0, cos(angle)) * sin(PI * t) * radius
			points.append(a.lerp(b, t) + offset)
		var arc := 0.0
		for i in range(1, points.size()):
			arc += points[i].distance_to(points[i - 1])
		if arc < length_m:
			low = radius
		else:
			high = radius
	return points

func _tube(points: PackedVector3Array, parent: Node3D) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.material_override = wire_material
	node.mesh = tube_mesh(points)
	parent.add_child(node)
	return node

static func tube_mesh(points: PackedVector3Array) -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(points.size() - 1):
		var tangent := (points[i + 1] - points[i]).normalized()
		var axis := tangent.cross(Vector3.UP).normalized()
		if axis.length() < 0.1:
			axis = Vector3.RIGHT
		var other := tangent.cross(axis).normalized()
		for j in range(6):
			var p := axis * cos(j * TAU / 6) + other * sin(j * TAU / 6)
			var q := axis * cos((j + 1) * TAU / 6) + other * sin((j + 1) * TAU / 6)
			for vertex in [points[i] + p * 0.0015, points[i + 1] + p * 0.0015, points[i + 1] + q * 0.0015, points[i] + p * 0.0015, points[i + 1] + q * 0.0015, points[i] + q * 0.0015]:
				surface.add_vertex(vertex)
	surface.generate_normals()
	return surface.commit()

func _end(at: Vector3, parent: Node3D, tight: bool) -> void:
	var end := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.0025
	cylinder.bottom_radius = 0.0025
	cylinder.height = 0.015
	end.mesh = cylinder
	end.material_override = _mat(Color("b6c0c3"))
	end.position = at + Vector3(0, 0.006, 0)
	parent.add_child(end)
	var marker := MeshInstance3D.new()
	var ball := SphereMesh.new()
	ball.radius = 0.004
	ball.height = 0.008
	marker.mesh = ball
	marker.position = at + Vector3(0.009, 0.010, 0)
	marker.material_override = _mat(Color("72917c") if tight else Color("c37e35"))
	parent.add_child(marker)

var preview_clock := 0.0
func _process(delta: float) -> void:
	preview_clock += delta
	if preview_clock < 0.07:
		return
	preview_clock = 0
	preview.visible = not held.is_empty() and is_instance_valid(player)
	if not preview.visible:
		return
	var rig := player.avatar.skeleton
	var hand := rig.to_global(rig.get_bone_global_pose(rig.find_bone("Hand.R")).origin)
	var start: Vector3 = terminals[held.a] if held.a >= 0 else hand + Vector3(-0.10, -0.08, 0.04)
	if start.distance_to(hand) > LENGTH[held.kind]:
		# A connected lead tethers the body instead of stretching the wire.
		player.global_position += (start - hand).normalized() * (start.distance_to(hand) - LENGTH[held.kind])
		player.velocity = Vector3.ZERO
		hand = start + (hand - start).normalized() * LENGTH[held.kind]
	preview.mesh = tube_mesh(wire_points(start, hand, LENGTH[held.kind]))
