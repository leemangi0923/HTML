class_name WorkshopAvatar
extends Node3D

const ASSET_PATH := "res://assets/character/student-uniform.glb"
var model: Node3D
var animation_player: AnimationPlayer
var skeleton: Skeleton3D
var clips: Dictionary = {}
var current_clip := ""
var first_person_hidden: Array[MeshInstance3D] = []
var body_meshes: Array[MeshInstance3D] = []

func _ready() -> void:
	name = "SchoolUniform"
	var asset := load(ASSET_PATH) as PackedScene
	assert(asset != null, "School character must be imported before running")
	model = asset.instantiate()
	model.position.y = -0.008
	add_child(model)
	for child in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := child as MeshInstance3D
		if mesh.name.begins_with("Head_") or mesh.name.begins_with("Badge"):
			mesh.layers = 2
			first_person_hidden.append(mesh)
			if mesh.name.begins_with("Badge"):
				mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		else:
			mesh.layers = 1
			body_meshes.append(mesh)
	animation_player = model.find_child("AnimationPlayer", true, false) as AnimationPlayer
	var bones := model.find_children("*", "Skeleton3D", true, false)
	assert(not bones.is_empty(), "Skinned character must have a skeleton")
	skeleton = bones[0]
	assert(animation_player != null, "Character must contain animation clips")
	for wanted in ["Idle", "Walk", "CrouchIdle", "CrouchWalk"]:
		for clip in animation_player.get_animation_list():
			if clip == wanted or clip.ends_with("/" + wanted) or clip.ends_with("|" + wanted):
				clips[wanted] = clip
				animation_player.get_animation(clip).loop_mode = Animation.LOOP_LINEAR
				break
		assert(clips.has(wanted), "Missing character animation: " + wanted)
	set_motion(0.0, false)

func set_motion(speed: float, crouched: bool) -> void:
	if animation_player == null:
		return
	var moving := speed > 0.08
	var desired := "CrouchWalk" if crouched and moving else "CrouchIdle" if crouched else "Walk" if moving else "Idle"
	if current_clip != desired:
		current_clip = desired
		animation_player.play(clips[desired], 0.16)
	var reference_speed := 0.625 if crouched else 1.04
	animation_player.speed_scale = clampf(speed / reference_speed, 0.55, 2.0) if moving else 1.0
