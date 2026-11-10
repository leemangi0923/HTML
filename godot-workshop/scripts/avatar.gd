class_name WorkshopAvatar
extends Node3D

const ASSET_PATH := "res://assets/character/workwear-character-rigged.glb"
var model: Node3D
var animation_player: AnimationPlayer
var skeleton: Skeleton3D
var clips: Dictionary = {}
var current_clip := ""
var first_person_hidden: Array[MeshInstance3D] = []
var body_meshes: Array[MeshInstance3D] = []
var head_shadow_meshes: Array[MeshInstance3D] = []
var cloth_materials: Dictionary = {}
var look_pitch := 0.0
var head_bone := -1
var head_base_rotation := Quaternion.IDENTITY
var arm_reach: WorkshopArmReach

func _ready() -> void:
	name = "SchoolUniform"
	var asset := load(ASSET_PATH) as PackedScene
	assert(asset != null, "School character must be imported before running")
	model = asset.instantiate()
	model.position.y = -0.0155
	add_child(model)
	for child in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := child as MeshInstance3D
		if mesh.name.begins_with("Head_") or mesh.name.begins_with("Badge"):
			mesh.layers = 2
			first_person_hidden.append(mesh)
			mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			if mesh.name.begins_with("Head_"):
				_add_head_shadow(mesh)
		else:
			mesh.layers = 1
			body_meshes.append(mesh)
			# Supplied material resources are retained without procedural overrides.
	animation_player = model.find_child("AnimationPlayer", true, false) as AnimationPlayer
	var bones := model.find_children("*", "Skeleton3D", true, false)
	assert(not bones.is_empty(), "Skinned character must have a skeleton")
	skeleton = bones[0]
	arm_reach = WorkshopArmReach.new()
	arm_reach.influence = 0
	skeleton.add_child(arm_reach)
	head_bone = skeleton.find_bone("Head")
	if head_bone >= 0:
		head_base_rotation = skeleton.get_bone_pose_rotation(head_bone)
	assert(animation_player != null, "Character must contain animation clips")
	animation_player.mixer_applied.connect(_apply_head_look)
	for wanted in ["Idle", "Walk", "CrouchIdle", "CrouchWalk"]:
		for clip in animation_player.get_animation_list():
			if clip == wanted or clip.ends_with("/" + wanted) or clip.ends_with("|" + wanted):
				clips[wanted] = clip
				animation_player.get_animation(clip).loop_mode = Animation.LOOP_LINEAR
				break
		assert(clips.has(wanted), "Missing character animation: " + wanted)
	set_motion(0.0, false)

func _add_head_shadow(source: MeshInstance3D) -> void:
	# A camera's layer mask also affects its shadow pass in Compatibility.
	# Share the existing mesh/skin and skeleton; render only its animated shadow.
	var shadow := MeshInstance3D.new()
	shadow.name = "Shadow_" + source.name
	shadow.mesh = source.mesh
	shadow.skin = source.skin
	shadow.skeleton = source.skeleton
	shadow.transform = source.transform
	shadow.layers = 1
	shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	source.get_parent().add_child(shadow)
	head_shadow_meshes.append(shadow)

func _apply_head_look() -> void:
	if head_bone < 0:
		return
	# Head is neutral in all four clips; crouch rotation is on Neck. Do not add to
	# last frame's pose: immutable animation tracks may have been removed on import.
	skeleton.set_bone_pose_rotation(head_bone, head_base_rotation * Quaternion(Vector3.RIGHT, clampf(look_pitch, -0.55, 0.35)))

func set_motion(speed: float, crouched: bool, local_velocity := Vector3.ZERO, delta := 1.0 / 60.0, working := false) -> void:
	if animation_player == null:
		return
	var moving := speed > 0.08
	var desired := "CrouchWalk" if crouched and moving else "CrouchIdle" if crouched else "Walk" if moving else "Idle"

	if current_clip != desired:
		current_clip = desired
		animation_player.play(clips[desired], 0.16)
	var reference_speed := 0.625 if crouched else 1.04
	var playback := clampf(speed / reference_speed, 0.55, 2.0) if moving else 1.0
	animation_player.speed_scale = -playback if moving and local_velocity.z > 0.08 else playback
	var blend := 1.0 - exp(-8.0 * delta)
	model.rotation.z = lerpf(model.rotation.z, -local_velocity.x * 0.018, blend)
	model.rotation.x = lerpf(model.rotation.x, local_velocity.z * 0.012, blend)

func reach_to(point: Vector3) -> void:
	arm_reach.target = point
	arm_reach.remaining = 0.7
