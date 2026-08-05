#!/usr/bin/env python3
"""Generate printable ToqueHub enclosures for Raspberry Pi 4 Model B and Pi 5.

The generated parts use millimetres.  The bases are designed around the official
85 x 56 mm board outline and 58 x 49 mm mounting-hole pattern.  Each enclosure
uses a tall, support-free base and a screw-fastened flat lid so that both parts
can be printed in their natural orientation.

Dependencies: trimesh, shapely, manifold3d, mapbox-earcut, numpy.
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union


# All dimensions are in millimetres.
BOARD_W = 85.0
BOARD_D = 56.0
BOARD_ORIGIN = (7.5, 7.5)
MOUNTING_HOLES = ((3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5))

CASE_W = 100.0
CASE_D = 71.0
BASE_H = 27.0
FLOOR_H = 2.2
WALL = 2.4
OUTER_RADIUS = 5.0
INNER_RADIUS = 2.8

STANDOFF_H = 3.2
STANDOFF_D = 6.2
BOARD_SCREW_PILOT_D = 2.2  # M2.5 self-tapping pilot

LID_H = 2.6
LOGO_RELIEF = 0.8
LID_SCREW_CLEARANCE_D = 3.4
LID_SCREW_HEAD_D = 6.4
LID_SCREW_HEAD_DEPTH = 1.45
LID_PILOT_D = 2.6  # M3 self-tapping pilot
LID_PILOT_DEPTH = 10.0
CORNER_BOSS_D = 7.2
CORNER_SCREWS = ((5.0, 5.0), (CASE_W - 5.0, 5.0),
                 (5.0, CASE_D - 5.0), (CASE_W - 5.0, CASE_D - 5.0))

SEGMENTS = 32


@dataclass(frozen=True)
class Port:
    """A support-friendly wall opening.

    side: front/rear openings use u=X; left/right openings use u=Y.
    The vertical coordinates are absolute enclosure Z values.
    """

    side: str
    center: float
    width: float
    z_min: float
    z_max: float
    top_chamfer: float = 2.0


PORTS = {
    "rpi4": (
        # Front edge: USB-C power, two micro-HDMI sockets and A/V jack.
        Port("front", BOARD_ORIGIN[0] + 10.6, 13.0, 3.0, 13.8, 2.0),
        Port("front", BOARD_ORIGIN[0] + 32.5, 13.0, 3.0, 13.8, 2.0),
        Port("front", BOARD_ORIGIN[0] + 46.0, 13.0, 3.0, 13.8, 2.0),
        Port("front", BOARD_ORIGIN[0] + 60.0, 9.0, 3.0, 14.5, 2.0),
        # Right edge: two USB stacks followed by Ethernet toward the GPIO edge.
        Port("right", BOARD_ORIGIN[1] + 9.0, 17.0, 2.8, 24.0, 3.0),
        Port("right", BOARD_ORIGIN[1] + 27.0, 17.0, 2.8, 24.0, 3.0),
        Port("right", BOARD_ORIGIN[1] + 45.75, 19.0, 2.8, 22.0, 3.0),
        # Underside micro-SD access.
        Port("left", BOARD_ORIGIN[1] + 28.0, 19.0, 2.6, 9.2, 1.5),
    ),
    "rpi5": (
        # Front edge: USB-C power and two micro-HDMI sockets.
        Port("front", BOARD_ORIGIN[0] + 11.2, 14.0, 3.0, 13.8, 2.0),
        Port("front", BOARD_ORIGIN[0] + 25.8, 13.0, 3.0, 13.8, 2.0),
        Port("front", BOARD_ORIGIN[0] + 39.2, 13.0, 3.0, 13.8, 2.0),
        # Right edge: Pi 5 reverses the Pi 4 layout (Ethernet then USB stacks).
        Port("right", BOARD_ORIGIN[1] + 10.2, 20.0, 2.8, 21.0, 3.0),
        Port("right", BOARD_ORIGIN[1] + 29.1, 17.0, 2.8, 24.0, 3.0),
        Port("right", BOARD_ORIGIN[1] + 47.0, 17.0, 2.8, 24.0, 3.0),
        # Power button and underside micro-SD access on the left edge.
        Port("left", BOARD_ORIGIN[1] + 13.3, 8.0, 4.0, 11.0, 1.5),
        Port("left", BOARD_ORIGIN[1] + 28.0, 18.0, 2.6, 9.2, 1.5),
    ),
}


PIXEL_FONT = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "4": ("10010", "10010", "10010", "11111", "00010", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    " ": ("00000",) * 7,
}


def rounded_rectangle(width: float, depth: float, radius: float) -> Polygon:
    radius = min(radius, width / 2.0, depth / 2.0)
    core = box(-width / 2.0 + radius, -depth / 2.0 + radius,
               width / 2.0 - radius, depth / 2.0 - radius)
    return core.buffer(radius, quad_segs=max(4, SEGMENTS // 4))


def extrude_geometry(geometry, height: float, z0: float = 0.0) -> list[trimesh.Trimesh]:
    geometries = list(geometry.geoms) if hasattr(geometry, "geoms") else [geometry]
    result: list[trimesh.Trimesh] = []
    for item in geometries:
        if item.is_empty or item.area < 1e-7:
            continue
        mesh = trimesh.creation.extrude_polygon(item, height=height, engine="earcut")
        mesh.apply_translation((0.0, 0.0, z0))
        result.append(mesh)
    return result


def rounded_prism(width: float, depth: float, radius: float,
                  height: float, z0: float = 0.0,
                  center: tuple[float, float] = (CASE_W / 2.0, CASE_D / 2.0)) -> trimesh.Trimesh:
    polygon = rounded_rectangle(width, depth, radius)
    polygon = affinity.translate(polygon, xoff=center[0], yoff=center[1])
    return extrude_geometry(polygon, height, z0)[0]


def cylinder(radius: float, height: float, center: Sequence[float]) -> trimesh.Trimesh:
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=SEGMENTS)
    mesh.apply_translation((center[0], center[1], center[2]))
    return mesh


def boolean_union(meshes: Iterable[trimesh.Trimesh]) -> trimesh.Trimesh:
    meshes = [mesh for mesh in meshes if mesh is not None]
    if len(meshes) == 1:
        return meshes[0]
    result = trimesh.boolean.union(meshes, engine="manifold", check_volume=False)
    if result is None:
        raise RuntimeError("Boolean union failed")
    return result


def boolean_difference(subject: trimesh.Trimesh,
                       cutters: Iterable[trimesh.Trimesh]) -> trimesh.Trimesh:
    cutters = [mesh for mesh in cutters if mesh is not None]
    if not cutters:
        return subject
    cutter = boolean_union(cutters)
    result = trimesh.boolean.difference([subject, cutter], engine="manifold", check_volume=False)
    if result is None:
        raise RuntimeError("Boolean difference failed")
    return result


def chamfered_opening(width: float, height: float, chamfer: float) -> Polygon:
    """Rectangle with 45-degree top corners for clean support-free bridges."""
    half_w = width / 2.0
    half_h = height / 2.0
    chamfer = max(0.0, min(chamfer, half_w - 0.2, height - 0.2))
    return Polygon((
        (-half_w, -half_h),
        (half_w, -half_h),
        (half_w, half_h - chamfer),
        (half_w - chamfer, half_h),
        (-half_w + chamfer, half_h),
        (-half_w, half_h - chamfer),
    ))


def wall_opening(port: Port) -> trimesh.Trimesh:
    height = port.z_max - port.z_min
    polygon = chamfered_opening(port.width, height, port.top_chamfer)
    meshes = extrude_geometry(polygon, WALL + 2.4, z0=-(WALL + 2.4) / 2.0)
    mesh = boolean_union(meshes)

    # Local polygon coordinates are (u, vertical Z); extrusion is local W.
    if port.side in ("front", "rear"):
        transform = np.array((
            (1.0, 0.0, 0.0, 0.0),
            (0.0, 0.0, -1.0, 0.0),
            (0.0, 1.0, 0.0, 0.0),
            (0.0, 0.0, 0.0, 1.0),
        ))
        mesh.apply_transform(transform)
        y = WALL / 2.0 if port.side == "front" else CASE_D - WALL / 2.0
        mesh.apply_translation((port.center, y, (port.z_min + port.z_max) / 2.0))
    elif port.side in ("left", "right"):
        transform = np.array((
            (0.0, 0.0, 1.0, 0.0),
            (1.0, 0.0, 0.0, 0.0),
            (0.0, 1.0, 0.0, 0.0),
            (0.0, 0.0, 0.0, 1.0),
        ))
        mesh.apply_transform(transform)
        x = WALL / 2.0 if port.side == "left" else CASE_W - WALL / 2.0
        mesh.apply_translation((x, port.center, (port.z_min + port.z_max) / 2.0))
    else:
        raise ValueError(f"Unknown wall: {port.side}")
    return mesh


def rear_vent_cutters() -> list[trimesh.Trimesh]:
    return [
        wall_opening(Port("rear", center, 10.0, 10.0, 17.0, 2.0))
        for center in (19.0, 32.0, 68.0, 81.0)
    ]


def mounting_standoffs() -> list[trimesh.Trimesh]:
    meshes: list[trimesh.Trimesh] = []
    for x, y in MOUNTING_HOLES:
        center = (BOARD_ORIGIN[0] + x, BOARD_ORIGIN[1] + y)
        meshes.append(cylinder(STANDOFF_D / 2.0, STANDOFF_H,
                               (center[0], center[1], FLOOR_H + STANDOFF_H / 2.0)))
    return meshes


def corner_bosses() -> list[trimesh.Trimesh]:
    height = BASE_H - FLOOR_H
    return [
        cylinder(CORNER_BOSS_D / 2.0, height, (x, y, FLOOR_H + height / 2.0))
        for x, y in CORNER_SCREWS
    ]


def base_cutters(model: str) -> list[trimesh.Trimesh]:
    cutters = [wall_opening(port) for port in PORTS[model]]
    cutters.extend(rear_vent_cutters())

    # Blind M2.5 pilot holes: 0.6 mm of floor remains at the bottom.
    board_hole_z0 = 0.6
    board_hole_h = FLOOR_H + STANDOFF_H - board_hole_z0 + 0.1
    for x, y in MOUNTING_HOLES:
        cx = BOARD_ORIGIN[0] + x
        cy = BOARD_ORIGIN[1] + y
        cutters.append(cylinder(BOARD_SCREW_PILOT_D / 2.0, board_hole_h,
                                (cx, cy, board_hole_z0 + board_hole_h / 2.0)))

    # Blind M3 pilot holes for the lid screws.
    for x, y in CORNER_SCREWS:
        cutters.append(cylinder(LID_PILOT_D / 2.0, LID_PILOT_DEPTH + 0.1,
                                (x, y, BASE_H - LID_PILOT_DEPTH / 2.0 + 0.05)))
    return cutters


def build_base(model: str) -> trimesh.Trimesh:
    outer = rounded_prism(CASE_W, CASE_D, OUTER_RADIUS, BASE_H)
    inner = rounded_prism(CASE_W - 2.0 * WALL, CASE_D - 2.0 * WALL,
                          INNER_RADIUS, BASE_H - FLOOR_H + 0.2, z0=FLOOR_H)
    shell = boolean_difference(outer, [inner])
    solid = boolean_union([shell, *corner_bosses(), *mounting_standoffs()])
    solid = boolean_difference(solid, base_cutters(model))
    return finish_mesh(solid)


def capsule(p1: tuple[float, float], p2: tuple[float, float], width: float):
    return LineString((p1, p2)).buffer(width / 2.0, cap_style="round", quad_segs=8)


def cubic_bezier(points: Sequence[tuple[float, float]], samples: int = 14) -> list[tuple[float, float]]:
    if len(points) != 4:
        raise ValueError("A cubic Bezier needs four control points")
    p0, p1, p2, p3 = np.asarray(points, dtype=float)
    result = []
    for t in np.linspace(0.0, 1.0, samples, endpoint=True):
        point = ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
                 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)
        result.append((float(point[0]), float(point[1])))
    return result


def toquehub_icon_geometry(center: tuple[float, float], scale: float = 1.0):
    # A compact line-art interpretation of the repository's toque/container mark.
    cloud_points: list[tuple[float, float]] = []
    segments = (
        ((-13.0, 2.0), (-16.0, 5.0), (-15.0, 11.0), (-10.0, 12.0)),
        ((-10.0, 12.0), (-8.0, 12.4), (-6.5, 11.5), (-5.5, 10.7)),
        ((-5.5, 10.7), (-6.0, 15.0), (-3.5, 18.0), (0.0, 18.0)),
        ((0.0, 18.0), (3.5, 18.0), (6.0, 15.0), (5.5, 10.7)),
        ((5.5, 10.7), (7.2, 12.0), (9.4, 12.5), (11.0, 11.8)),
        ((11.0, 11.8), (15.5, 10.2), (16.0, 5.0), (13.0, 2.0)),
    )
    for index, controls in enumerate(segments):
        sampled = cubic_bezier(controls)
        cloud_points.extend(sampled if index == 0 else sampled[1:])

    shapes = [LineString(cloud_points).buffer(1.15, cap_style="round", join_style="round")]

    # Lower U-shaped container, three controls and the centre dash.
    u_points = [(-9.0, 1.0), (-9.0, -6.0), (-8.0, -9.0), (-5.5, -10.5),
                (0.0, -10.8), (5.5, -10.5), (8.0, -9.0), (9.0, -6.0), (9.0, 1.0)]
    shapes.append(LineString(u_points).buffer(1.15, cap_style="round", join_style="round"))
    for x in (-6.0, 0.0, 6.0):
        shapes.append(rounded_rectangle(3.8, 3.5, 0.8).buffer(0))
        shapes[-1] = affinity.translate(shapes[-1], xoff=x, yoff=4.0)
    shapes.append(capsule((-2.0, -5.3), (2.0, -5.3), 1.8))

    geometry = unary_union(shapes)
    geometry = affinity.scale(geometry, xfact=scale, yfact=scale, origin=(0.0, 0.0))
    return affinity.translate(geometry, xoff=center[0], yoff=center[1])


def pixel_text_geometry(text: str, pixel: float, gap: float, letter_gap: float,
                        center: tuple[float, float], corner: float = 0.12):
    advance = 5.0 * pixel + 4.0 * gap + letter_gap
    total_w = len(text) * (5.0 * pixel + 4.0 * gap) + (len(text) - 1) * letter_gap
    total_h = 7.0 * pixel + 6.0 * gap
    origin_x = center[0] - total_w / 2.0
    origin_y = center[1] - total_h / 2.0
    cells = []
    for char_index, char in enumerate(text):
        pattern = PIXEL_FONT[char]
        char_x = origin_x + char_index * advance
        for row, bits in enumerate(pattern):
            for col, bit in enumerate(bits):
                if bit != "1":
                    continue
                x0 = char_x + col * (pixel + gap)
                y0 = origin_y + (6 - row) * (pixel + gap)
                cell = rounded_rectangle(pixel, pixel, min(corner, pixel * 0.2))
                cell = affinity.translate(cell, xoff=x0 + pixel / 2.0, yoff=y0 + pixel / 2.0)
                cells.append(cell)
    return unary_union(cells)


def lid_vent_geometry():
    slots = []
    # Two rows frame the wide ToqueHub logo and provide airflow over the SoC area.
    for x in (52.0, 62.0, 72.0, 82.0):
        slots.append(capsule((x - 3.4, 23.0), (x + 3.4, 23.0), 2.2))
        slots.append(capsule((x - 3.4, 51.5), (x + 3.4, 51.5), 2.2))
    return unary_union(slots)


def build_lid(model: str) -> trimesh.Trimesh:
    plate = rounded_prism(CASE_W, CASE_D, OUTER_RADIUS, LID_H)

    # Through holes, recessed for common M3 button/socket heads.
    cutters: list[trimesh.Trimesh] = []
    for x, y in CORNER_SCREWS:
        cutters.append(cylinder(LID_SCREW_CLEARANCE_D / 2.0, LID_H + 0.4,
                                (x, y, LID_H / 2.0)))
        cutters.append(cylinder(LID_SCREW_HEAD_D / 2.0, LID_SCREW_HEAD_DEPTH + 0.2,
                                (x, y, LID_H - LID_SCREW_HEAD_DEPTH / 2.0 + 0.1)))

    for mesh in extrude_geometry(lid_vent_geometry(), LID_H + 0.4, z0=-0.2):
        cutters.append(mesh)
    plate = boolean_difference(plate, cutters)

    icon = toquehub_icon_geometry((24.0, 37.0), scale=0.82)
    wordmark = pixel_text_geometry("TOQUEHUB", pixel=0.78, gap=0.14, letter_gap=0.82,
                                   center=(69.0, 37.0), corner=0.12)
    label = pixel_text_geometry("RPI 4" if model == "rpi4" else "RPI 5",
                                pixel=0.48, gap=0.10, letter_gap=0.58,
                                center=(69.0, 13.5), corner=0.08)

    relief_parts: list[trimesh.Trimesh] = []
    for geometry in (icon, wordmark, label):
        relief_parts.extend(extrude_geometry(geometry, LOGO_RELIEF + 0.05, z0=LID_H - 0.05))
    lid = boolean_union([plate, *relief_parts])
    return finish_mesh(lid)


def finish_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh.remove_unreferenced_vertices()
    mesh.merge_vertices()
    # Manifold3D returns consistently wound, watertight surfaces.  Keeping this
    # final pass dependency-light also makes regeneration possible without SciPy.
    return mesh


def export_mesh(mesh: trimesh.Trimesh, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(path, file_type="stl")
    print(
        f"{path.name}: faces={len(mesh.faces):,}, "
        f"watertight={mesh.is_watertight}, volume={mesh.volume:.1f} mm^3, "
        f"bounds={np.round(mesh.extents, 2).tolist()} mm"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "STL",
                        help="STL output directory")
    parser.add_argument("--model", choices=("rpi4", "rpi5", "all"), default="all")
    args = parser.parse_args()

    models = ("rpi4", "rpi5") if args.model == "all" else (args.model,)
    for model in models:
        model_dir = args.output / ("Raspberry_Pi_4" if model == "rpi4" else "Raspberry_Pi_5")
        stem = "ToqueHub_RPi4" if model == "rpi4" else "ToqueHub_RPi5"
        export_mesh(build_base(model), model_dir / f"{stem}_Base.stl")
        export_mesh(build_lid(model), model_dir / f"{stem}_Capot.stl")


if __name__ == "__main__":
    main()
