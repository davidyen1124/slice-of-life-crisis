# 長崎カステラ — the scene, built and lit in Blender, in metres.
#
#   public/scene.glb  the castella loaf, the hinoki board, the washi sheet, the sujihiki knife and a yunomi of tea
#   art/raw/room.hdr  a 360° panorama of the morning room, rendered in Cycles from where the cake sits,
#                     which lights the web scene and is what the knife and the crust reflect
#   art/raw/look.png  (with --look) a Cycles still of the whole scene from the web page's desktop camera, for QA
#
# usage: Blender -b -P blender/scene.py -- [--glb public/scene.glb] [--hdr art/raw/room.hdr] [--look art/raw/look.png]
#
# The loaf: a 1号 castella (580 g, sold in a 28.5 x 10 x 6.5 cm box) is 27 x 9 x 6 cm. It is baked as a big slab in a
# paper-lined wooden frame and cut into loaves, so its four sides are cut crumb, and only the top (a smooth, deep
# caramel skin) and the bottom (dark, set with zarame sugar) are crust. Each vertex carries `skin` in COLOR_0.r:
# 1 on the baked top and bottom, 0 on the cut sides. The web page cuts this mesh and shades every cut face from the
# loaf-space position, so slices stay continuous with each other.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
GLB = os.path.join(ROOT, arg('--glb', 'public/scene.glb'))
HDR = os.path.join(ROOT, arg('--hdr', 'art/raw/room.hdr'))
LOOK = arg('--look')
SAMPLES = int(arg('--samples', '192'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
random.seed(7)

# ---------------------------------------------------------------------------------------------------------------- utils
def material(name, color, rough=0.5, metal=0.0, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
    return m

def obj_from_bmesh(name, bm, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    if mat:
        me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = smooth
    return o

def axis_samples(half, r, step):
    """Grid lines along one axis of a rounded box: uniform inside, and three per rounded edge so that, once
    projected, the edge's quarter-round is split into six even segments."""
    b = half - r
    n = max(1, round(2 * b / step))
    inner = [-b + 2 * b * i / n for i in range(n + 1)]
    edge = [b + r * math.tan(math.radians(a)) for a in (15, 30)] + [half]
    return sorted(set([round(v, 7) for v in inner + edge + [-e for e in edge]]))

def rounded_box(hx, hy, hz, r, step, cz=0.0):
    """A closed, quad-dominant rounded box (Blender Z up) centred on (0, 0, cz), with every face a grid."""
    bm = bmesh.new()
    xs, ys, zs = axis_samples(hx, r, step), axis_samples(hy, r, step), axis_samples(hz, r, step)
    b = Vector((hx - r, hy - r, hz - r))
    def proj(p):
        q = Vector((max(-b.x, min(b.x, p.x)), max(-b.y, min(b.y, p.y)), max(-b.z, min(b.z, p.z))))
        d = p - q
        return q + d.normalized() * r if d.length > 1e-9 else p
    verts = {}
    def v(p):
        k = (round(p.x, 6), round(p.y, 6), round(p.z, 6))
        if k not in verts:
            verts[k] = bm.verts.new(proj(Vector(k)) + Vector((0, 0, cz)))
        return verts[k]
    def face_grid(us, vs, make):
        for j in range(len(vs) - 1):
            for i in range(len(us) - 1):
                quad = [v(make(us[i], vs[j])), v(make(us[i + 1], vs[j])), v(make(us[i + 1], vs[j + 1])), v(make(us[i], vs[j + 1]))]
                bm.faces.new(quad)
    face_grid(xs, ys, lambda a, c: Vector((a, c, hz)))            # top
    face_grid(ys, xs, lambda a, c: Vector((c, a, -hz)))           # bottom
    face_grid(xs, zs, lambda a, c: Vector((a, -hy, c)))           # front (-y)
    face_grid(zs, xs, lambda a, c: Vector((c, hy, a)))            # back
    face_grid(zs, ys, lambda a, c: Vector((hx, c, a)))            # right (+x)
    face_grid(ys, zs, lambda a, c: Vector((-hx, a, c)))           # left
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

# --------------------------------------------------------------------------------------------------------- the castella
L, W, H = 0.27, 0.09, 0.06
R_EDGE = 0.0016          # the crust edges are knife-cut but soft, so they round over by a millimetre or two
bm = rounded_box(L / 2, W / 2, H / 2, R_EDGE, 0.004, cz=H / 2)

# hand-made imperfections, kept far smaller than anything that would make the loaf non-convex:
# the top rises a hair in the middle and is faintly uneven, the cut sides carry the knife's long faint ripples,
# and the loaf as a whole is a touch narrower at the top, as a slab shrinks a little from the frame as it cools.
seed = Vector((3.1, 7.7, 1.3))
for vert in bm.verts:
    p = vert.co
    z01 = p.z / H
    top = max(0.0, (z01 - 0.75) / 0.25)
    nx, ny = p.x / (L / 2), p.y / (W / 2)
    dome = 0.0007 * (1 - nx * nx) * (1 - ny * ny)
    lumpy = 0.00028 * noise.noise(p * 38 + seed) + 0.00012 * noise.noise(p * 120 + seed)
    p.z += top * (dome + lumpy)
    side = abs(ny) > 0.97 and 0.03 < z01 < 0.97
    end = abs(nx) > 0.99 and 0.03 < z01 < 0.97
    taper = 1 - 0.006 * z01
    p.x *= taper if end else 1
    p.y *= taper
    if side:
        p.y += math.copysign(0.00012 * noise.noise(Vector((p.x * 60, 0, p.z * 6)) + seed), p.y)
    if end:
        p.x += math.copysign(0.00012 * noise.noise(Vector((0, p.y * 60, p.z * 6)) + seed), p.x)

# skin: 1 on the baked top and bottom (and over the rounded crust edge), 0 on the four cut sides
col = bm.loops.layers.color.new('skin')
for f in bm.faces:
    for loop in f.loops:
        p = loop.vert.co
        s = 1.0 if (p.z > H - R_EDGE * 0.6 or p.z < R_EDGE * 0.6) else 0.0
        loop[col] = (s, s, s, 1.0)
castella = obj_from_bmesh('castella', bm, material('castella', (0.95, 0.78, 0.36), 0.8))
castella.data.color_attributes.active_color = castella.data.color_attributes['skin']

# ------------------------------------------------------------------------------- the hinoki board and the washi sheet
BL, BW, BT = 0.42, 0.20, 0.018
bm = rounded_box(BL / 2, BW / 2, BT / 2, 0.0025, 0.03, cz=-BT / 2)
board = obj_from_bmesh('board', bm, material('hinoki', (0.86, 0.72, 0.55), 0.62))

# the washi a castella is baked on (敷紙): a sheet under the loaf, with a soft crumple, its corners lifting a little
bm = bmesh.new()
PL, PW, N = 0.31, 0.135, 48
grid = [[bm.verts.new((-PL / 2 + PL * i / N, -PW / 2 + PW * j / 16, 0)) for i in range(N + 1)] for j in range(17)]
for j in range(16):
    for i in range(N):
        bm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]])
for vert in bm.verts:
    p = vert.co
    under = abs(p.x) < L / 2 + 0.002 and abs(p.y) < W / 2 + 0.002
    ex = max(0.0, abs(p.x) - L / 2) / (PL / 2 - L / 2)
    ey = max(0.0, abs(p.y) - W / 2) / (PW / 2 - W / 2)
    lift = 0 if under else 0.0012 * max(ex, ey) ** 2 + 0.0002 * (noise.noise(p * 70 + seed) + 0.5)
    p.z = 0.0002 + lift
paper = obj_from_bmesh('washi', bm, material('washi', (0.93, 0.91, 0.86), 0.9))

# -------------------------------------------------------------------------------------------------- the sujihiki knife
# A Japanese slicer: 27 cm blade, 3.4 cm tall at the heel, a flat grind from a 1.8 mm spine to the edge,
# a magnolia (ho) octagonal handle with a black horn ferrule. In its own frame: the edge runs along +X at z = 0,
# the spine is at z = +heel height, the blade's flat faces look along ±Y; the handle is at -X.
bm = bmesh.new()
BLADE, HEEL, SPINE = 0.27, 0.034, 0.0018
NS = 40
def blade_height(t):          # t: 0 heel .. 1 tip; the spine stays straight and the edge sweeps up to the tip
    return HEEL * (1 - t ** 3.2)
rows = []
for i in range(NS + 1):
    t = i / NS
    x = BLADE * t
    h = max(blade_height(t), 0.0005)
    thick = SPINE * (1 - 0.6 * t)
    zspine = HEEL
    ze = zspine - h
    shin = ze + min(0.0035, h * 0.6)   # where the flat grind meets the narrow cutting bevel
    ring = [
        bm.verts.new((x, 0, ze)),                      # edge
        bm.verts.new((x, -thick * 0.18, shin)),
        bm.verts.new((x, -thick / 2, zspine - 0.0006)),
        bm.verts.new((x, -thick / 2 + 0.0002, zspine)),
        bm.verts.new((x, thick / 2 - 0.0002, zspine)),
        bm.verts.new((x, thick / 2, zspine - 0.0006)),
        bm.verts.new((x, thick * 0.18, shin)),
    ]
    rows.append(ring)
for i in range(NS):
    a, b = rows[i], rows[i + 1]
    n = len(a)
    for k in range(n):
        bm.faces.new([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]])
bm.faces.new(list(reversed(rows[0])))
bm.faces.new(rows[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
blade = obj_from_bmesh('knife_blade', bm, material('steel', (0.78, 0.79, 0.8), 0.22, metal=1.0))

def octagon_prism(name, x0, x1, r0, r1, zc, mat, n=8):
    bm = bmesh.new()
    rings = []
    for x, r in ((x0, r0), (x1, r1)):
        rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * (k + 0.5) / n), zc + r * 1.12 * math.sin(2 * math.pi * (k + 0.5) / n))) for k in range(n)])
    for k in range(n):
        bm.faces.new([rings[0][k], rings[0][(k + 1) % n], rings[1][(k + 1) % n], rings[1][k]])
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges], offset=0.0008, segments=2, affect='EDGES', profile=0.5)
    return obj_from_bmesh(name, bm, mat, smooth=False)
ZH = HEEL - 0.011
ferrule = octagon_prism('knife_ferrule', -0.022, 0.0, 0.0115, 0.0108, ZH, material('horn', (0.025, 0.02, 0.018), 0.28))
handle = octagon_prism('knife_handle', -0.135, -0.022, 0.0122, 0.0116, ZH, material('ho wood', (0.56, 0.5, 0.36), 0.55))
for o in (ferrule, handle):
    for poly in o.data.polygons:
        poly.use_smooth = False

# ------------------------------------------------------------------------------------------- a yunomi of green tea
# a tall, slightly tapered cup in a celadon / ash glaze, at the back of the table, to be thrown out of focus
prof = [(0.0, 0.0), (0.028, 0.0), (0.0305, 0.004), (0.0335, 0.07), (0.0345, 0.082), (0.0325, 0.083), (0.0315, 0.072), (0.0285, 0.009), (0.0, 0.008)]
bm = bmesh.new()
SEG = 48
rings = [[bm.verts.new((r * math.cos(2 * math.pi * k / SEG), r * math.sin(2 * math.pi * k / SEG), z)) for k in range(SEG)] for r, z in prof]
for a, b in zip(rings, rings[1:]):
    for k in range(SEG):
        bm.faces.new([a[k], a[(k + 1) % SEG], b[(k + 1) % SEG], b[k]])
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
cup = obj_from_bmesh('yunomi', bm, material('celadon', (0.62, 0.68, 0.6), 0.18))
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=SEG, radius=0.0318)
for vert in bm.verts:
    vert.co.z = 0.058
tea = obj_from_bmesh('tea', bm, material('sencha', (0.42, 0.45, 0.12), 0.05))

# ----------------------------------------------------------------------------------------------------- export the glb
for o in bpy.data.objects:
    o.select_set(o.type == 'MESH')
os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=GLB, export_format='GLB', use_selection=True, export_apply=True,
    export_normals=True, export_texcoords=False, export_vertex_color='NAME', export_vertex_color_name='skin', export_all_vertex_colors=False,
    export_materials='EXPORT', export_yup=True, export_extras=False,
)
print('exported', GLB)

# --------------------------------------------------------------------------------------------------- the morning room
# A plaster room, 4 x 3.6 m, with a shoji window on the left (west) wall full of soft morning daylight, a pale oak
# floor, a linen-covered table. The cake sits at the origin on the table top (z = 0), which is 72 cm above the floor.
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = 'GPU'
except Exception as e:
    print('no gpu', e)
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('sky')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.82, 0.95, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6

def box(name, size, loc, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(loc)
    return obj_from_bmesh(name, bm, mat, smooth=False)

plaster = material('plaster', (0.83, 0.79, 0.72), 0.92)
oak = material('oak floor', (0.52, 0.4, 0.28), 0.5)
linen = material('linen', (0.72, 0.66, 0.57), 0.95)
FLOOR = -0.72
box('floor', (6, 6, 0.05), (0, 0, FLOOR - 0.025), oak)
box('ceiling', (6, 6, 0.05), (0, 0, FLOOR + 2.45), material('ceiling', (0.9, 0.88, 0.84), 0.9))
box('wall_back', (6, 0.06, 2.5), (0, 1.0, FLOOR + 1.25), plaster)
box('wall_front', (6, 0.06, 2.5), (0, -2.6, FLOOR + 1.25), plaster)
box('wall_right', (0.06, 6, 2.5), (2.0, 0, FLOOR + 1.25), plaster)
# the left wall, with a 1.8 x 1.5 m opening holding a glowing shoji
for name, size, loc in (('wl_a', (0.06, 1.8, 2.5), (-2.0, 1.9, FLOOR + 1.25)), ('wl_b', (0.06, 2.0, 2.5), (-2.0, -1.9, FLOOR + 1.25)),
                        ('wl_c', (0.06, 1.8, 0.75), (-2.0, 0.1, FLOOR + 0.375)), ('wl_d', (0.06, 1.8, 0.25), (-2.0, 0.1, FLOOR + 2.375))):
    box(name, size, loc, plaster)
box('shoji', (0.02, 1.8, 1.5), (-2.02, 0.1, FLOOR + 1.5), material('shoji', (1, 1, 1), 0.9, emit=(1.0, 0.97, 0.9), strength=7.0))
wood = material('kumiko', (0.55, 0.42, 0.3), 0.6)
for k in range(7):
    box('kumiko_v%d' % k, (0.03, 0.018, 1.5), (-2.0, -0.8 + 0.3 * k, FLOOR + 1.5), wood)
for k in range(5):
    box('kumiko_h%d' % k, (0.03, 1.8, 0.018), (-2.0, 0.1, FLOOR + 0.75 + 0.375 * k), wood)
box('table', (1.6, 0.9, 0.04), (0.1, 0.1, -0.02), linen)
# the sun through the shoji, and a soft bounce from the right wall
bpy.ops.object.light_add(type='AREA', location=(-1.9, 0.1, FLOOR + 1.5), rotation=(0, math.radians(90), 0))
a = bpy.context.active_object
a.data.shape = 'RECTANGLE'
a.data.size, a.data.size_y = 1.5, 1.8
a.data.energy = 420
a.data.color = (1.0, 0.95, 0.86)

if LOOK:
    # a still of the whole scene, from the web page's desktop camera, for comparing looks in QA
    cup.location = (0.19, 0.24, 0)
    tea.location = cup.location
    for o in (blade, ferrule, handle):
        o.location = (-0.02, -0.105, 0.0)
        o.rotation_euler = (math.radians(90), 0, math.radians(-8))
    cam = bpy.data.cameras.new('look')
    cam.lens = 70
    co = bpy.data.objects.new('look', cam)
    scene.collection.objects.link(co)
    co.location = (0.12, -0.62, 0.38)
    co.rotation_euler = (math.radians(58), 0, math.radians(11))
    scene.camera = co
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = os.path.join(ROOT, LOOK)
    bpy.ops.render.render(write_still=True)
    print('rendered', LOOK)

# the panorama, from the cake: hide the cake things so the room is all that is reflected
for o in (castella, board, paper, blade, ferrule, handle, cup, tea):
    o.hide_render = True
pano = bpy.data.cameras.new('pano')
pano.type = 'PANO'
try:
    pano.panorama_type = 'EQUIRECTANGULAR'
except AttributeError:
    pano.cycles.panorama_type = 'EQUIRECTANGULAR'
pano.clip_start = 0.001
po = bpy.data.objects.new('pano', pano)
scene.collection.objects.link(po)
po.location = (0, 0, 0.05)
po.rotation_euler = (math.pi / 2, 0, 0)
scene.camera = po
scene.render.resolution_x, scene.render.resolution_y = 1024, 512
scene.render.image_settings.file_format = 'HDR'
os.makedirs(os.path.dirname(HDR), exist_ok=True)
scene.render.filepath = HDR
bpy.ops.render.render(write_still=True)
print('rendered', HDR)
