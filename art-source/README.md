# School-uniform character authoring files

`student-uniform.blend` is the editable Blender 4.3.2 source for the original character in the Godot project. `decals` contains rasterized versions of the project's own school/WorldSkills SVG interpretations based on the user's supplied uniform references. The provided student photographs are not copied into the project.

The navy/gray cloth mesh is subdivided and skinned to a humanoid armature. Leg IK and foot constraints are baked into Idle, Walk, CrouchIdle and CrouchWalk animation clips when exporting glTF. The runtime asset has 18 deform bones; authoring control bones are excluded. Head and upper-sleeve badges remain separate named meshes so the first-person camera can hide them while retaining the complete model. The head still casts a shadow; badge shadows are disabled to avoid projecting floating emblem shapes.

Rebuild from the repository root:

```sh
CHROMIUM_PATH=/usr/bin/chromium node scripts/prepare-character-decals.cjs
blender -b --factory-startup --python scripts/build-godot-character.py
```

The `.blend` authoring file deliberately lives outside `godot-workshop`: learners opening the distributed Godot project need only Godot, without Blender or external add-ons. The GLB embeds the textures. Godot may extract two PNG files during import; these are included in the source ZIP as well.

This is a stylized first character based on the approved design, not a photogrammetric replica or a direct conversion of the generated concept image. Cloth shapes, proportions and emblems can be revised from user feedback. Finger meshes currently move with the hand bone; finger-by-finger gripping and tool interactions are not implemented.
