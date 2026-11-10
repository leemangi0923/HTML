extends Node3D

var _materials: Dictionary = {}
var layout: Dictionary

func _ready() -> void:
	name = "Workbench"
	layout = JSON.parse_string(FileAccess.get_file_as_string("res://assets/layout.json"))
	_build_table()
	_build_panel()
	_build_operator_panel()
	_build_conveyor()

func _material(color: Color) -> StandardMaterial3D:
	var key := color.to_html()
	if not _materials.has(key):
		var mat := StandardMaterial3D.new()
		mat.albedo_color = color
		mat.roughness = 0.7
		mat.metallic = 0.10
		_materials[key] = mat
	return _materials[key]

func box_at(at: Vector3, size: Vector3, color: Color, label_text := "", solid := false) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var shape := BoxMesh.new()
	shape.size = size
	mesh.mesh = shape
	mesh.material_override = _material(color)
	mesh.position = at
	add_child(mesh)
	if solid or not label_text.is_empty():
		var body := StaticBody3D.new()
		body.set_meta("label", label_text)
		var collision := CollisionShape3D.new()
		var bounds := BoxShape3D.new()
		bounds.size = size
		collision.shape = bounds
		body.add_child(collision)
		mesh.add_child(body)
	return mesh

func _rect(r: Dictionary, height: float, color: Color, title: String) -> void:
	var center := Vector3((float(r.x) + float(r.w) / 2 - 620) / 1000, 0.755 + height / 2, (float(r.y) + float(r.h) / 2 - 460) / 1000)
	box_at(center, Vector3(float(r.w) / 1000, height, float(r.h) / 1000), color, title)

func _face(r: Dictionary, top: float, file_path: String) -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(float(r.w) / 1000, float(r.h) / 1000)
	var mesh := MeshInstance3D.new()
	mesh.mesh = plane
	mesh.position = Vector3((float(r.x) + float(r.w) / 2 - 620) / 1000, top + 0.0004, (float(r.y) + float(r.h) / 2 - 460) / 1000)
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load(file_path)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	mat.roughness = 0.85
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mesh.material_override = mat
	add_child(mesh)

func _build_table() -> void:
	box_at(Vector3(0, 0.73, 0.05), Vector3(1.55, 0.04, 1.30), Color("295343"), "작업대", true)
	for x in [-0.72, 0.72]:
		for z in [-0.54, 0.64]:
			box_at(Vector3(x, 0.35, z), Vector3(0.035, 0.70, 0.035), Color("7b858c"), "작업대 다리", true)
	for z in [-0.54, 0.64]:
		box_at(Vector3(0, 0.64, z), Vector3(1.48, 0.025, 0.025), Color("7b858c"))
	# The mat grid stops at the tabletop edges.
	for i in range(63):
		box_at(Vector3(-0.775 + i * 0.025, 0.7503, 0.05), Vector3(0.0003, 0.0002, 1.3), Color("50765c"))
	for i in range(53):
		box_at(Vector3(0, 0.7503, -0.6 + i * 0.025), Vector3(1.55, 0.0002, 0.0003), Color("50765c"))

func _build_panel() -> void:
	_rect({"x": 0, "y": 0, "w": 760, "h": 600}, 0.005, Color("b5bcc0"), "제어판 · 760 × 600 mm")
	for frame in layout.frames:
		var height := 0.04 if frame.type == "duct" else 0.008
		_rect(frame, height, Color("dedfdb") if frame.type == "duct" else Color("aeb8bd"), "덕트" if frame.type == "duct" else "딘레일")
		_face(frame, 0.755 + height, frame.image)
	var depths := {"mcb": 0.065, "fuse": 0.055, "smps": 0.065, "plc": 0.055, "pos": 0.055, "relay": 0.048, "timer": 0.057, "xtb40": 0.030, "tb": 0.025, "xtb50": 0.030, "servo": 0.080}
	for device in layout.devices:
		var height: float = depths[device.type]
		_rect(device, height, Color("333c41") if device.type in ["relay", "timer", "tb", "servo"] else Color("bec7c4"), str(device.name))
		_face(device, 0.755 + height, device.image)

func _build_operator_panel() -> void:
	var op: Dictionary = layout.op
	_rect(op, 0.005, Color("b5bcc0"), "조작판 · 375 × 270 mm")
	_face(op, 0.761, op.front)
	# Physical HMI enclosure, with the exact front drawing cropped during packaging.
	var cut: Dictionary = op.cut
	var hmi := {"x": float(op.x) + float(cut.x) - 4, "y": float(op.y) + float(cut.y) - 4, "w": float(cut.w) + 8, "h": float(cut.h) + 8}
	_rect(hmi, 0.024, Color("20292d"), "HMI")
	_face(hmi, 0.780, "res://assets/faces/hmi.png")
	var colors := {"lampW": Color("e8e9e2"), "lampR": Color("ba3836"), "lampG": Color("2e8c4f"), "lampY": Color("d5b844"), "pbG": Color("2e8c4f"), "pbR": Color("ba3836"), "ems": Color("ba3836"), "ss": Color("282e32"), "bz": Color("c4c9b8")}
	for hole in op.holes:
		var point: Array = op.holes[hole]
		var answer: Dictionary = op.answer[hole]
		var mesh := MeshInstance3D.new()
		var cylinder := CylinderMesh.new()
		cylinder.top_radius = 0.014 if answer.type == "ems" else 0.0125
		cylinder.bottom_radius = cylinder.top_radius
		cylinder.height = 0.014
		mesh.mesh = cylinder
		mesh.material_override = _material(colors[answer.type])
		mesh.position = Vector3((float(op.x) + float(point[0]) - 620) / 1000, 0.771, (float(op.y) + float(point[1]) - 460) / 1000)
		add_child(mesh)

func _build_conveyor() -> void:
	var cv: Dictionary = layout.conveyor
	_rect({"x": cv.x, "y": cv.y, "w": cv.L, "h": cv.w}, 0.03, Color("74838a"), "컨베이어 · 500 mm")
	_rect({"x": cv.x, "y": cv.y, "w": cv.L, "h": cv.w}, 0.034, Color("258c48"), "컨베이어 벨트")
	for i in range(39):
		box_at(Vector3((float(cv.x) + i * 13 - 620) / 1000, 0.7895, (float(cv.y) + float(cv.w) / 2 - 460) / 1000), Vector3(0.0008, 0.0004, float(cv.w) / 1000), Color("45a563"))
	for offset in [0, cv.w]:
		box_at(Vector3((float(cv.x) + 250 - 620) / 1000, 0.785, (float(cv.y) + float(offset) - 460) / 1000), Vector3(0.52, 0.01, 0.006), Color("c1c9cb"))
	_rect({"x": float(cv.x) + float(cv.mx), "y": float(cv.y) - 9 - float(cv.mh), "w": cv.mw, "h": cv.mh}, 0.032, Color("394950"), "컨베이어 모터")
	for entry in [["S1", cv.s1], ["S2", cv.s2]]:
		_rect({"x": float(cv.x) + float(entry[1]) - 10, "y": float(cv.y) - 45, "w": 20, "h": 30}, 0.045, Color("293f4c"), str(entry[0]) + " 센서")
