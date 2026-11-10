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
var terminal_keys: Array[String] = []
var terminal_labels: Array[String] = []
var internal_links: Array = []
var visuals: Node3D
var connection_nodes: Dictionary = {}
var tight_material: StandardMaterial3D
var loose_material: StandardMaterial3D
var preview: MeshInstance3D
var held_caps: Array[MeshInstance3D] = []
var player: WorkshopPlayer
var status_label: Label3D
var save_path := "user://prepared-wires-v2.json"
var legacy_save_path := "user://prepared-wires-v1.json"
var persistence := true
var wire_material: StandardMaterial3D
var held_rope: WorkshopWireRope
var transferred_rope: WorkshopWireRope
var transferred_key := ""
var stock_meshes: Dictionary = {}
var stock_endpoints: Dictionary = {}
var stock_caps: Dictionary = {}
var support_grid := PackedFloat32Array()
var render_clock := 0.0
var physics_dirty := false
var save_clock := 0.0
var queue_offset := 0
var dragged_rope: WorkshopWireRope
var drag_height := 0.0

func _ready() -> void:
	name = "PreparedWires"
	wire_material = _mat(Color("e8b927"))
	tight_material = _mat(Color("72917c"))
	loose_material = _mat(Color("c37e35"))
	visuals = Node3D.new()
	add_child(visuals)
	preview = MeshInstance3D.new()
	preview.material_override = wire_material
	add_child(preview)
	for i in range(2):
		var cap := MeshInstance3D.new()
		var pin := CylinderMesh.new()
		pin.top_radius = 0.002
		pin.bottom_radius = 0.002
		pin.height = 0.012
		cap.mesh = pin
		cap.material_override = _mat(Color("b6c0c3"))
		cap.visible = false
		add_child(cap)
		held_caps.append(cap)
	# Full-length straight stock, rather than short coils standing in for wire.
	var stand := _box(Vector3(1.12, 0.91, -0.25), Vector3(0.48, 0.06, 4.2), Color("40545a"))
	_hit(stand, {"label": "전선 재료대"}, Vector3(0.48, 0.06, 4.2))
	for x in [0.92, 1.32]:
		for z in [-2.12, 1.62]:
			_box(Vector3(x, 0.45, z), Vector3(0.025, 0.90, 0.025), Color("68777a"))
	for kind in ["standard", "long"]:
		var center := Vector3(1.015, 0.955, 0.36) if kind == "standard" else Vector3(1.24, 0.955, -0.25)
		var size := Vector3(0.21, 0.016, LENGTH[kind] + 0.04)
		var supply := _box(center, size, Color("263c43"))
		_hit(supply, {"supply": kind}, size + Vector3(0,0.01,0))
		_build_stock(kind)
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
			terminal_keys.append("TEST.X%d.%s" % [col + 1, "t" if row == 0 else "b"])
			terminal_labels.append("연습 X%d %s" % [col + 1, "위" if row == 0 else "아래"])
			var socket := _box(at, Vector3(0.041, 0.012, 0.043), Color("6b7477"))
			_hit(socket, {"terminal": terminals.size() - 1}, Vector3(0.045, 0.025, 0.048))
			var label := Label3D.new()
			label.text = "X%d" % (col + 1)
			label.font_size = 25
			label.pixel_size = 0.0007
			label.rotation_degrees.x = -90
			label.position = at + Vector3(0, 0.008, 0)
			add_child(label)
	_add_panel_terminals()
	_build_support_grid()
	var read_path := save_path if FileAccess.file_exists(save_path) else legacy_save_path
	if persistence and FileAccess.file_exists(read_path):
		restore(JSON.parse_string(FileAccess.get_file_as_string(read_path)))
	refresh()

func _build_stock(kind: String) -> void:
	var instance := MultiMeshInstance3D.new()
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.0015
	cylinder.bottom_radius = 0.0015
	cylinder.height = 1.0
	cylinder.radial_segments = 6
	multi.mesh = cylinder
	multi.instance_count = TOTAL[kind]
	var caps := MultiMesh.new()
	caps.transform_format = MultiMesh.TRANSFORM_3D
	var tip := CylinderMesh.new()
	tip.top_radius = 0.002
	tip.bottom_radius = 0.002
	tip.height = 0.012
	tip.radial_segments = 8
	caps.mesh = tip
	caps.instance_count = TOTAL[kind] * 2
	var basis := Basis(Vector3.RIGHT, PI / 2)
	stock_endpoints[kind] = []
	for i in range(TOTAL[kind]):
		var at := Vector3(0.928 + (i % 20) * 0.009, 0.965 + (i / 20) * 0.0032, 0.36) if kind == "standard" else Vector3(1.16 + i * 0.020, 0.965, -0.25)
		multi.set_instance_transform(i, Transform3D(basis.scaled_local(Vector3(1, LENGTH[kind], 1)), at))
		stock_endpoints[kind].append([at+Vector3(0,0,-LENGTH[kind]/2),at+Vector3(0,0,LENGTH[kind]/2)])
		caps.set_instance_transform(i*2, Transform3D(basis, at + Vector3(0,0,-LENGTH[kind]/2+0.006)))
		caps.set_instance_transform(i*2+1, Transform3D(basis, at + Vector3(0,0,LENGTH[kind]/2-0.006)))
	instance.multimesh = multi
	instance.material_override = wire_material
	add_child(instance)
	var cap_instance := MultiMeshInstance3D.new()
	cap_instance.multimesh = caps
	cap_instance.material_override = _mat(Color("b6c0c3"))
	add_child(cap_instance)
	stock_meshes[kind] = multi
	stock_caps[kind] = caps

func _stamp(center: Vector3, size: Vector3, top: float) -> void:
	var x0 := clampi(floori((center.x-size.x/2+3)*100),0,600)
	var x1 := clampi(ceili((center.x+size.x/2+3)*100),0,600)
	var z0 := clampi(floori((center.z-size.z/2+2.8)*100),0,560)
	var z1 := clampi(ceili((center.z+size.z/2+2.8)*100),0,560)
	for z in range(z0,z1+1):
		for x in range(x0,x1+1):
			var index := z*601+x
			support_grid[index] = maxf(support_grid[index],top)

func _build_support_grid() -> void:
	support_grid.resize(601*561)
	support_grid.fill(0.002)
	_stamp(Vector3(0,0,0.05),Vector3(1.55,0,1.3),0.75)
	_stamp(Vector3(1.12,0,-0.25),Vector3(0.48,0,4.2),0.94)
	_stamp(Vector3(1.015,0,0.36),Vector3(0.21,0,1.24),0.963)
	_stamp(Vector3(1.24,0,-0.25),Vector3(0.21,0,4.04),0.963)
	_stamp(Vector3(0.34,0,0.51),Vector3(0.30,0,0.13),0.796)
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/layout.json"))
	var depths := {"mcb":0.065,"fuse":0.055,"smps":0.065,"plc":0.055,"pos":0.055,"relay":0.048,"timer":0.057,"xtb40":0.030,"tb":0.025,"xtb50":0.030,"servo":0.080}
	var rects: Array = data.devices.duplicate()
	for frame in data.frames:
		var r: Dictionary = frame.duplicate()
		r["depth"] = 0.04 if r.type == "duct" else 0.008
		rects.append(r)
	for r in rects:
		var center := Vector3((float(r.x)+float(r.w)/2-620)/1000,0,(float(r.y)+float(r.h)/2-460)/1000)
		_stamp(center,Vector3(float(r.w)/1000,0,float(r.h)/1000),0.755+float(r.get("depth",depths.get(r.type,0))))
	_stamp(Vector3(-0.24,0,-0.16),Vector3(0.76,0,0.60),0.760)
	var op: Dictionary = data.op
	_stamp(Vector3((op.x+op.w/2-620)/1000,0,(op.y+op.h/2-460)/1000),Vector3(op.w/1000,0,op.h/1000),0.760)

	var cut: Dictionary = op.cut
	_stamp(Vector3((op.x+cut.x+cut.w/2-620)/1000,0,(op.y+cut.y+cut.h/2-460)/1000),Vector3((cut.w+8)/1000,0,(cut.h+8)/1000),0.781)
	for point in op.holes.values():
		_stamp(Vector3((op.x+point[0]-620)/1000,0,(op.y+point[1]-460)/1000),Vector3(0.028,0,0.028),0.779)
	var cv: Dictionary = data.conveyor
	_stamp(Vector3((cv.x+cv.L/2-620)/1000,0,(cv.y+cv.w/2-460)/1000),Vector3(cv.L/1000,0,cv.w/1000),0.790)

func _support_height(p: Vector3) -> float:
	var x := clampi(floori((p.x+3)*100),0,600)
	var z := clampi(floori((p.z+2.8)*100),0,560)
	return support_grid[z*601+x]

func _wire_key(wire: Dictionary) -> String:
	return "%s:%d:%d" % [wire.kind,wire.a,wire.b]

func _make_rope(wire: Dictionary, complete: bool) -> WorkshopWireRope:
	var rope := WorkshopWireRope.new()
	var a: Vector3 = terminals[wire.a] if wire.a >= 0 else _hand_position()
	var b: Vector3 = terminals[wire.b] if complete else a + Vector3.FORWARD
	rope.initialize(a,(b-a).normalized(),LENGTH[wire.kind])
	rope.anchors(a,b,complete)
	var loaded := rope.load_shape(wire.get("shape"))
	if loaded and complete and wire.get("resting",false) and rope.points[0].distance_to(a)<0.001 and rope.points[-1].distance_to(b)<0.001:
		var supported := true
		for i in range(1,rope.points.size()-1):
			if rope.points[i].y<_support_height(rope.points[i])+0.0014:
				supported = false
		rope.sleeping = supported
	return rope

func _add_panel_terminals() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/layout.json"))
	var depths := {"mcb": 0.065, "fuse": 0.055, "smps": 0.065, "plc": 0.055, "relay": 0.048, "timer": 0.057, "xtb40": 0.030, "tb": 0.025, "xtb50": 0.030}
	var first := terminals.size()
	for device in data.devices:
		for pin in device.get("terminals", []):
			var at := Vector3((float(device.x) + float(pin.x) - 620) / 1000, 0.755 + float(depths[device.type]) + 0.004, (float(device.y) + float(pin.y) - 460) / 1000)
			var id := terminals.size()
			terminals.append(at)
			terminal_keys.append(str(device.name) + "." + str(pin.k))
			terminal_labels.append(str(device.name) + " · " + str(pin.nm))
			var body := StaticBody3D.new()
			body.position = at
			body.set_meta("terminal", id)
			var collider := CollisionShape3D.new()
			var shape := BoxShape3D.new()
			shape.size = Vector3(0.0055, 0.008, 0.0055)
			collider.shape = shape
			body.add_child(collider)
			add_child(body)
	# One draw call for all metal screw heads.
	var screws := MultiMeshInstance3D.new()
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	var screw := CylinderMesh.new()
	screw.top_radius = 0.0018
	screw.bottom_radius = 0.0018
	screw.height = 0.002
	screw.radial_segments = 8
	multi.mesh = screw
	multi.instance_count = terminals.size() - first
	for id in range(first, terminals.size()):
		multi.set_instance_transform(id - first, Transform3D(Basis.IDENTITY, terminals[id]))
	screws.multimesh = multi
	screws.material_override = _mat(Color("9ca5a8"))
	add_child(screws)
	for col in range(6):
		internal_links.append([col, col + 6])
	for col in range(1, 41):
		internal_links.append([terminal_keys.find("TB.%d.t" % col), terminal_keys.find("TB.%d.b" % col)])
	for pair in [["SMPS.V1", "SMPS.V2"], ["SMPS.G1", "SMPS.G2"]]:
		internal_links.append([terminal_keys.find(pair[0]), terminal_keys.find(pair[1])])

func connected(a: int, b: int) -> bool:
	if a < 0 or b < 0 or a >= terminals.size() or b >= terminals.size():
		return false
	var graph := {}
	var links := internal_links.duplicate()
	for wire in installed:
		if wire.tight_a and wire.tight_b:
			links.append([wire.a, wire.b])
	for pair in links:
		if pair[0] < 0 or pair[1] < 0:
			continue
		for i in range(2):
			if not graph.has(pair[i]):
				graph[pair[i]] = []
			graph[pair[i]].append(pair[1 - i])
	var pending := [a]
	var seen := {a: true}
	while not pending.is_empty():
		var current: int = pending.pop_back()
		if current == b:
			return true
		for next in graph.get(current, []):
			if not seen.has(next):
				seen[next] = true
				pending.append(next)
	return false

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
	var wires := installed.duplicate(true)
	for wire in wires:
		var key := _wire_key(wire)
		if connection_nodes.has(key):
			wire["shape"] = connection_nodes[key].rope.shape()
			wire["resting"] = connection_nodes[key].rope.sleeping
	var carry := held.duplicate(true)
	if not carry.is_empty() and held_rope != null:
		carry["shape"] = held_rope.shape()
	return {"schema":2,"terminal_keys":terminal_keys.duplicate(),"installed":wires,"held":carry}

func restore(data: Variant) -> bool:
	if not data is Dictionary or (data.get("schema") != 1 and data.get("schema") != 2) or not data.get("installed") is Array or not data.get("held") is Dictionary:
		return false
	data = data.duplicate(true)
	if data.schema == 1:
		var legacy_wires: Array = data.installed.duplicate()
		if not data.held.is_empty():
			legacy_wires.append(data.held)
		for wire in legacy_wires:
			if not wire is Dictionary or not (wire.get("a") is int or wire.get("a") is float) or not (wire.get("b") is int or wire.get("b") is float):
				return false
			if wire.a >= 12 or wire.b >= 12:
				return false
	if data.schema == 2:
		if not data.get("terminal_keys") is Array:
			return false
		var wires: Array = data.installed.duplicate()
		if not data.held.is_empty():
			wires.append(data.held)
		for wire in wires:
			if not wire is Dictionary:
				return false
			for end in ["a", "b"]:
				var old: Variant = wire.get(end)
				if not (old is int or old is float) or old != floor(old) or old < -1 or old >= data.terminal_keys.size():
					return false
				if old >= 0:
					var mapped := terminal_keys.find(str(data.terminal_keys[int(old)]))
					if mapped < 0:
						return false
					wire[end] = mapped
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
	if dragged_rope != null:
		dragged_rope.grab_index = -1
		dragged_rope = null
	for entry in connection_nodes.values():
		entry.node.free()
	connection_nodes.clear()
	held_rope = null
	installed = data.installed.duplicate(true)
	held = data.held.duplicate(true)
	return true

func _valid_wire(w: Dictionary, complete: bool) -> bool:
	if not TOTAL.has(w.get("kind", "")):
		return false
	for end in ["a", "b"]:
		var value: Variant = w.get(end)
		if not (value is int or value is float) or value != floor(value) or value < -1 or value >= terminals.size():
			return false
		w[end] = int(value)
	if not w.get("tight_a") is bool or not w.get("tight_b") is bool:
		return false
	if not complete and (w.b != -1 or w.tight_b or (w.a == -1 and w.tight_a)):
		return false
	return w.a >= (0 if complete else -1) and w.a < terminals.size() and w.b >= (0 if complete else -1) and w.b < terminals.size() and (not complete or w.a != w.b)

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
		transferred_rope = held_rope
		transferred_key = _wire_key(held)
		installed.append(held.duplicate(true))
		held.clear()
	refresh()
	return terminal_labels[id] + "에 삽입했어요. F로 나사를 조이세요."

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
	var alive := {}
	for wire in installed:
		var key := _wire_key(wire)
		alive[key] = true
		if not connection_nodes.has(key):
			var group := Node3D.new()
			visuals.add_child(group)
			var rope := transferred_rope if transferred_key == key and transferred_rope != null else _make_rope(wire,true)
			rope.anchors(terminals[wire.a],terminals[wire.b],true)
			var mesh := _tube(rope.points,group)
			connection_nodes[key] = {"node":group,"rope":rope,"mesh":mesh,"dirty":true,"a":_end(terminals[wire.a],group,wire.tight_a),"b":_end(terminals[wire.b],group,wire.tight_b)}
		connection_nodes[key].a.material_override = tight_material if wire.tight_a else loose_material
		connection_nodes[key].b.material_override = tight_material if wire.tight_b else loose_material
	for key in connection_nodes.keys():
		if not alive.has(key):
			connection_nodes[key].node.free()
			connection_nodes.erase(key)
	status_label.visible = false
	status_label.text = "준비된 전선\n일반 %d / 120\n긴 선 %d / 9\n조준 + E 집기" % [available("standard"), available("long")]
	for kind in TOTAL:
		stock_meshes[kind].visible_instance_count = available(kind)
		stock_caps[kind].visible_instance_count = available(kind)*2
	if held.is_empty():
		held_rope = null
	elif held_rope == null:
		held_rope = _make_rope(held,false)
	transferred_rope = null
	transferred_key = ""
	save_physics()
	changed.emit()

func save_physics() -> void:
	if persistence:
		var file := FileAccess.open(save_path,FileAccess.WRITE)
		if file:
			file.store_string(JSON.stringify(state()))
	physics_dirty = false

func _exit_tree() -> void:
	if is_instance_valid(visuals):
		save_physics()

func _tube(points: PackedVector3Array, parent: Node3D) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.material_override = wire_material
	node.mesh = tube_mesh(_smooth_points(points))
	parent.add_child(node)
	return node

func _smooth_points(points: PackedVector3Array) -> PackedVector3Array:
	var result := PackedVector3Array()
	for i in range(points.size()-1):
		var a := points[maxi(0,i-1)]
		var b := points[i]
		var c := points[i+1]
		var d := points[mini(points.size()-1,i+2)]
		for sample in range(4):
			var t := sample/4.0
			var p := 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
			if not (i==0 and sample==0):
				p.y = maxf(p.y,_support_height(p)+WorkshopWireRope.RADIUS)
			result.append(p)
	result.append(points[-1])
	return result

static func tube_mesh(points: PackedVector3Array) -> ArrayMesh:
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var indices := PackedInt32Array()
	var axis := Vector3.RIGHT
	for i in range(points.size()):
		var tangent := (points[mini(i+1,points.size()-1)]-points[maxi(0,i-1)]).normalized()
		if tangent.length() < 0.1:
			tangent = Vector3.FORWARD
		axis = (axis-tangent*axis.dot(tangent)).normalized()
		if axis.length() < 0.1:
			axis = tangent.cross(Vector3.UP).normalized()
			if axis.length() < 0.1:
				axis = Vector3.FORWARD
		var other := tangent.cross(axis).normalized()
		for j in range(8):
			var normal := axis*cos(j*TAU/8)+other*sin(j*TAU/8)
			vertices.append(points[i]+normal*0.0015)
			normals.append(normal)
		if i > 0:
			for j in range(8):
				var a := (i-1)*8+j
				var b := (i-1)*8+(j+1)%8
				var c := i*8+j
				var d := i*8+(j+1)%8
				indices.append_array(PackedInt32Array([a,c,d,a,d,b]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	return mesh

func _end(at: Vector3, parent: Node3D, tight: bool) -> MeshInstance3D:
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
	marker.material_override = tight_material if tight else loose_material
	parent.add_child(marker)
	return marker

func begin_drag(camera: Camera3D) -> String:
	var mouse := get_viewport().get_mouse_position()
	var best := 12.0
	var selected: WorkshopWireRope
	var selected_index := -1
	for entry in connection_nodes.values():
		var rope: WorkshopWireRope = entry.rope
		for i in range(rope.points.size()-1):
			var a := camera.unproject_position(rope.points[i])
			var b := camera.unproject_position(rope.points[i+1])
			var nearest := Geometry2D.get_closest_point_to_segment(mouse,a,b)
			var distance := nearest.distance_to(mouse)
			if distance<best:
				best = distance
				selected = rope
				selected_index = clampi(i if nearest.distance_to(a)<nearest.distance_to(b) else i+1,1,rope.points.size()-2)
	if selected == null:
		return "전선의 중간에 커서를 두고 Shift+왼쪽 버튼으로 끌어주세요."
	_before()
	dragged_rope = selected
	dragged_rope.grab_index = selected_index
	dragged_rope.grab_position = selected.points[selected_index]
	dragged_rope.sleeping = false
	dragged_rope.quiet_ticks = 0
	drag_height = selected.points[selected_index].y+0.025
	return "전선을 잡았어요. 끌어서 옮기고 놓으면 중력으로 내려앉아요."

func move_drag(camera: Camera3D) -> void:
	if dragged_rope == null:
		return
	var mouse := get_viewport().get_mouse_position()
	var origin := camera.project_ray_origin(mouse)
	var ray := camera.project_ray_normal(mouse)
	if absf(ray.y)<0.001:
		return
	var point := origin+ray*((drag_height-origin.y)/ray.y)
	point.y = maxf(point.y,_support_height(point)+0.012)
	var rope := dragged_rope
	var first_length := rope.grab_index*rope.segment
	var last_length := (rope.points.size()-1-rope.grab_index)*rope.segment
	for iteration in range(8):
		if point.distance_to(rope.anchor_a)>first_length:
			point = rope.anchor_a+(point-rope.anchor_a).normalized()*first_length
		if rope.pin_b and point.distance_to(rope.anchor_b)>last_length:
			point = rope.anchor_b+(point-rope.anchor_b).normalized()*last_length
	if point.y<_support_height(point)+WorkshopWireRope.RADIUS:
		return
	rope.grab_position = point
	rope.sleeping = false
	rope.quiet_ticks = 0
	for entry in connection_nodes.values():
		if entry.rope == rope:
			entry.dirty = true

func release_drag() -> void:
	if dragged_rope == null:
		return
	dragged_rope.grab_index = -1
	dragged_rope.sleeping = false
	dragged_rope.quiet_ticks = 0
	dragged_rope = null
	save_physics()

func _hand_position() -> Vector3:
	if not is_instance_valid(player):
		return Vector3(1.02,1.0,0.36)
	var rig := player.avatar.skeleton
	var hand_id := rig.find_bone("Hand.R")
	var local_grip := rig.get_bone_global_rest(hand_id).basis.inverse()*Vector3(-0.035,-0.085,-0.035)
	var hand := rig.to_global(rig.get_bone_global_pose(hand_id)*local_grip)
	if player.work_view:
		var camera := get_viewport().get_camera_3d()
		var pixel := get_viewport().get_mouse_position()
		var origin := camera.project_ray_origin(pixel)
		var ray := camera.project_ray_normal(pixel)
		var height: float = terminals[held.a].y+0.025 if held.get("a",-1)>=0 else 1.03
		if absf(ray.y)>0.001:
			hand = origin+ray*((height-origin.y)/ray.y)
	return hand

func _physics_process(delta: float) -> void:
	if is_instance_valid(player) and not player.active:
		return
	if held_rope != null and not held.is_empty():
		var hand := _hand_position()
		if held.a>=0:
			var start := terminals[held.a]
			if start.distance_to(hand)>LENGTH[held.kind]:
				if is_instance_valid(player) and not player.work_view:
					player.global_position += (start-hand).normalized()*(start.distance_to(hand)-LENGTH[held.kind])
					player.velocity = Vector3.ZERO
				hand = start+(hand-start).normalized()*LENGTH[held.kind]
			held_rope.anchors(start,hand,true)
		else:
			held_rope.anchors(hand,Vector3.ZERO,false)
		held_rope.step(delta,_support_height)
		physics_dirty = true
	if dragged_rope != null:
		dragged_rope.step(delta,_support_height)
		physics_dirty = true
	var entries := connection_nodes.values()
	var updated := 0
	for offset in range(entries.size()):
		var index := (queue_offset+offset)%entries.size()
		var entry: Dictionary = entries[index]
		if entry.rope == dragged_rope:
			entry.dirty = true
			continue
		if entry.rope.sleeping:
			continue
		entry.rope.step(delta,_support_height)
		entry.dirty = true
		physics_dirty = true
		updated += 1
		if updated>=4:
			queue_offset = (index+1)%entries.size()
			break
	save_clock += delta
	if physics_dirty and save_clock>=2.0:
		save_clock = 0
		save_physics()

func _process(delta: float) -> void:
	render_clock += delta
	if render_clock<1.0/30:
		return
	render_clock = 0
	preview.visible = held_rope != null and not held.is_empty()
	for cap in held_caps:
		cap.visible = preview.visible
	if preview.visible:
		preview.mesh = tube_mesh(_smooth_points(held_rope.points))
		for i in range(2):
			var at: Vector3 = held_rope.points[0] if i == 0 else held_rope.points[-1]
			var toward: Vector3 = held_rope.points[1]-at if i == 0 else held_rope.points[-2]-at
			var direction := toward.normalized()
			if direction.length()>0.1:
				held_caps[i].transform = Transform3D(Basis(Quaternion(Vector3.UP,direction)),at+direction*0.006)
	for entry in connection_nodes.values():
		if entry.dirty:
			entry.mesh.mesh = tube_mesh(_smooth_points(entry.rope.points))
			entry.dirty = false
