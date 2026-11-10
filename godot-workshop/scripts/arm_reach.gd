class_name WorkshopArmReach
extends SkeletonModifier3D

var target := Vector3.ZERO
var remaining := 0.0

func _process_modification() -> void:
	var rig := get_skeleton()
	if rig == null:
		return
	remaining = maxf(0.0, remaining - get_process_delta_time())
	influence = move_toward(influence, 1.0 if remaining > 0 else 0.0, get_process_delta_time() * 7)
	if influence < 0.001:
		return
	var upper := rig.find_bone("UpperArm.R")
	var fore := rig.find_bone("Forearm.R")
	var hand := rig.find_bone("Hand.R")
	var a := rig.get_bone_global_pose(upper).origin
	var b := rig.get_bone_global_pose(fore).origin
	var c := rig.get_bone_global_pose(hand).origin
	var goal := rig.to_local(target)
	var l1 := a.distance_to(b)
	var l2 := b.distance_to(c)
	var direction := (goal - a).normalized()
	var distance := clampf(a.distance_to(goal), 0.06, l1 + l2 - 0.006)
	goal = a + direction * distance
	var pole := Vector3(1, -0.3, 0.2)
	pole = (pole - direction * pole.dot(direction)).normalized()
	var along := (l1*l1 - l2*l2 + distance*distance) / (2*distance)
	var elbow := a + direction * along + pole * sqrt(maxf(0, l1*l1 - along*along))
	_rotate_toward(rig, upper, b - a, elbow - a)
	b = rig.get_bone_global_pose(fore).origin
	c = rig.get_bone_global_pose(hand).origin
	_rotate_toward(rig, fore, c - b, goal - b)

func _rotate_toward(rig: Skeleton3D, bone: int, from: Vector3, to: Vector3) -> void:
	if from.length() < 0.001 or to.length() < 0.001:
		return
	var pose := rig.get_bone_global_pose(bone)
	pose.basis = Basis(Quaternion(from.normalized(), to.normalized())) * pose.basis
	rig.set_bone_global_pose(bone, pose)
