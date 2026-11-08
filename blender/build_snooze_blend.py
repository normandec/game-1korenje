"""build_snooze_blend.py — assemble the editable Blender project for SNOOZE.

Run with Blender (or the `bpy` module):

    blender -b --python blender/build_snooze_blend.py
    python3 blender/build_snooze_blend.py            # with the bpy module

What it builds (and saves as output/SNOOZE_project.blend):

  * a 1080x1920, 24 fps, 2880-frame scene (exactly 120.0 s)
  * one collection per story layer: CHARACTERS / BACKGROUNDS / ANIMATION / SHOTS
  * the twelve shot plates as 2D camera-facing layers, keyframed on and off
    at the exact frame ranges from the film's timeline
  * Grease Pencil objects for the alarm clock and the Sun, ready for hand
    animation on top of the plates
  * timeline markers named after every shot, plus the shot list, timing and
    colour script as editable Text datablocks

The plates are the rendered key frames from snooze/film.py, packed into the
.blend so the project opens self-contained.
"""

import math
import os
import sys

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATES = os.path.join(ROOT, 'blender', 'plates')
OUT_BLEND = os.path.join(ROOT, 'output', 'SNOOZE_project.blend')

W, H, FPS = 1080, 1920, 24
FRAMES = 2880

SHOTS = [
    # name,                start_s, end_s, plate
    ("01_snooze_itself",      0.0,   4.0, "s01_start"),
    ("02_morning_is_late",    4.0,  12.0, "s02_city"),
    ("03_attempt_ring",      12.0,  23.0, "s03_ring"),
    ("04_attempt_dance",     23.0,  34.0, "s04_dance"),
    ("05_attempt_feather",   34.0,  46.0, "s05_feather"),
    ("06_giant_yawn",        46.0,  59.0, "s06_yawn"),
    ("07_tiny_recovery",     59.0,  70.0, "s07_recovery"),
    ("08_the_clever_plan",   70.0,  85.0, "s08_ribbon"),
    ("09_sun_wakes",         85.0,  97.0, "s09_sunrise"),
    ("10_morning_arrives",   97.0, 107.0, "s10_morning"),
    ("11_day_races_by",     107.0, 116.0, "s11_timelapse"),
    ("12_seamless_ending",  116.0, 120.0, "s12_loop"),
]


# --------------------------------------------------------------------------- #
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_scene():
    sc = bpy.context.scene
    sc.name = 'SNOOZE'
    sc.render.resolution_x = W
    sc.render.resolution_y = H
    sc.render.resolution_percentage = 100
    sc.render.fps = FPS
    sc.frame_start = 1
    sc.frame_end = FRAMES
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [
        i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items
    ] else 'BLENDER_EEVEE'
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'   # keep the 2D colours exact
    sc.world = bpy.data.worlds.new('SNOOZE_world')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.02, 0.02, 0.05, 1)
        bg.inputs[1].default_value = 1.0
    return sc


def make_collections():
    names = ['01_CHARACTERS', '02_BACKGROUNDS', '03_ANIMATION', '04_SHOTS']
    colls = {}
    for n in names:
        c = bpy.data.collections.new(n)
        bpy.context.scene.collection.children.link(c)
        colls[n] = c
    return colls


def make_camera():
    cam_data = bpy.data.cameras.new('SNOOZE_cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 1.92          # vertical extent in metres
    cam = bpy.data.objects.new('SNOOZE_cam', cam_data)
    cam.location = (0, 0, 5)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def _image_material(name, img):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emit = nt.nodes.new('ShaderNodeEmission')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    tex.extension = 'EXTEND'
    nt.links.new(tex.outputs['Color'], emit.inputs['Color'])
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    out.location = (300, 0)
    emit.location = (0, 0)
    tex.location = (-320, 0)
    return mat


def make_plate(name, path, coll):
    """A flat 2D layer: a 1:1.777 plane filling the ortho camera."""
    img = bpy.data.images.load(path, check_existing=False)
    img.name = name
    try:
        img.pack()
    except Exception:
        pass
    mesh = bpy.data.meshes.new(f'{name}_mesh')
    hw, hh = 0.54, 0.96
    verts = [(-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0)]
    faces = [(0, 1, 2, 3)]
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name='UVMap')
    for i, (u, v) in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[i].uv = (u, v)
    mesh.materials.append(_image_material(f'{name}_mat', img))
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.location = (0, 0, 0)
    return obj


def make_grease_pencil(coll):
    """Two GP layers so hand animation can start straight away."""
    made = []
    gp_data = bpy.data.grease_pencils.new('SNOOZE_GP')
    obj = bpy.data.objects.new('SNOOZE_GP_animation', gp_data)
    coll.objects.link(obj)
    for layer_name in ('CLOCK', 'SUN', 'NOTES'):
        layer = gp_data.layers.new(layer_name)
        made.append(layer_name)
    return obj


def add_text_blocks():
    timing = bpy.data.texts.new('TIMING')
    timing.write("SNOOZE — 120.0 s, 24 fps, 2880 frames, 1080x1920 (vertical)\n"
                 "Frame 1 = 0.0 s, frame 2880 = 119.958 s\n\n")
    for name, s0, s1, plate in SHOTS:
        f0, f1 = int(round(s0 * FPS)) + 1, int(round(s1 * FPS))
        timing.write(f"{name:22s} {int(s0 // 60)}:{s0 % 60:04.1f}"
                     f" - {int(s1 // 60)}:{s1 % 60:04.1f}"
                     f"   frames {f0:4d}-{f1:4d}   plate: {plate}\n")

    readme = bpy.data.texts.new('README')
    readme.write(
        "SNOOZE — editable project\n"
        "=========================\n\n"
        "Collections\n"
        "  01_CHARACTERS  the alarm clock, the Sun, the birds (Grease Pencil)\n"
        "  02_BACKGROUNDS sky, horizon, city, clouds\n"
        "  03_ANIMATION   timing notes, markers, camera\n"
        "  04_SHOTS       the twelve shot plates (2D layers)\n\n"
        "Each plate is a rendered key frame from snooze/film.py, packed into\n"
        "this file. They are keyframed visible only inside their shot so the\n"
        "timeline reads as an actual edit, not one long still.\n\n"
        "To hand-animate: draw on SNOOZE_GP_animation in the CLOCK or SUN\n"
        "layer (or add your own Grease Pencil object to 01_CHARACTERS) and\n"
        "keyframe it. The plates are emission-shaded so the flat colours of\n"
        "the film stay exact.\n\n"
        "The authoritative animation source is snooze/film.py; re-render the\n"
        "plates with:  python3 -m snooze.plates\n")

    colour = bpy.data.texts.new('COLOUR_SCRIPT')
    colour.write(
        "Colour script (midnight -> peach/pink/gold -> midnight)\n"
        "  midnight   #080C28 #111A44 #243066\n"
        "  latenight  #0A1030 #16204E #2A3568\n"
        "  preglow    #101838 #252D62 #4A4A80\n"
        "  dawnfaint  #172046 #3A3A70 #8A6A8E\n"
        "  dawn       #242E5E #6A5A9A #E0957E\n"
        "  sunrise    #2E4176 #8A7AB0 #F4A87C\n"
        "  morning    #4E86C8 #9CC4E8 #FFE0B4\n"
        "  day        #3E86D8 #86BCEC #D6ECFA\n"
        "  afternoon  #4E8EDA #A6C8E8 #FFD9A8\n"
        "  evening    #3A3E82 #8A5E92 #F0907A\n"
        "  dusk       #1E2452 #3E3A76 #B0668A\n"
        "  nightfall  #0C1132 #1A2352 #3A4270\n\n"
        "Characters (fixed, never shift between shots)\n"
        "  clock body #F2604C   face #FFF3DE   bells #F6B93B\n"
        "  sun        #FFD155   rim  #B3671F   cheeks #FF9E6E\n"
        "  ink outline #2C1B3A")


def add_markers(sc):
    for name, s0, s1, _ in SHOTS:
        f = int(round(s0 * FPS)) + 1
        sc.timeline_markers.new(name, frame=f)


def build():
    clear_scene()
    sc = setup_scene()
    colls = make_collections()
    make_camera()
    add_markers(sc)
    add_text_blocks()
    make_grease_pencil(colls['01_CHARACTERS'])

    for name, s0, s1, plate_name in SHOTS:
        path = os.path.join(PLATES, plate_name + '.png')
        if not os.path.exists(path):
            print(f"  (missing plate {path} — skipped)")
            continue
        obj = make_plate(plate_name, path, colls['04_SHOTS'])
        f0, f1 = int(round(s0 * FPS)) + 1, int(round(s1 * FPS))
        # keyframe the layer in and out of its shot
        for frame, visible in ((1, f0 <= 1), (max(1, f0 - 1), False),
                               (f0, True), (f1, True), (f1 + 1, False)):
            obj.hide_render = not visible
            obj.hide_viewport = not visible
            obj.keyframe_insert('hide_render', frame=frame)
            obj.keyframe_insert('hide_viewport', frame=frame)
        obj.hide_render = False
        obj.hide_viewport = False

    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
    print('saved', OUT_BLEND)


if __name__ == '__main__':
    build()
