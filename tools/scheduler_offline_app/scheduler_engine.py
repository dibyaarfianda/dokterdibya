from __future__ import annotations

import copy
import json
import math
import random
import time
from collections import Counter
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

import openpyxl
from openpyxl.styles import PatternFill


@dataclass
class StaffMember:
    no: int
    name: str
    row: int


@dataclass
class SchedulerConfig:
    sheet_name: str = "JADWAL BARU"
    start_day: int = 1
    end_day: int = 31

    max_core_rank: int = 14
    p_count: int = 3
    s_count: int = 3
    m_count: int = 3

    iterations: int = 60000
    initial_temperature: float = 4.5
    cooling_rate: float = 0.99
    cooling_step: int = 3000
    random_seed: int = 707

    tandem_senior_max_rank: int = 11
    top_rank_count: int = 2
    top_rank_max_night: int = 3
    max_consecutive_work: int = 6

    # Example for rank 1..14: 12,12,11,11,10,10,9,9,9,9,9,8,8,8
    off_targets_by_rank: Optional[List[int]] = None

    # Example for rank 12,13,14: [12, 13, 14]
    uniform_group_ranks: Optional[List[int]] = None

    enforce_no_m_to_p: bool = True
    enforce_mll_each: bool = True
    enforce_rank_group_not_together: bool = True
    enforce_tandem: bool = True
    enforce_top_rank_night_cap: bool = True
    enforce_uniform_group_off: bool = True
    enforce_uniform_group_night: bool = True
    enforce_night_monotonic: bool = True
    enforce_off_monotonic: bool = True

    assign_colors: bool = True
    yellow_only_max_rank: int = 11
    polos_per_shift: int = 2
    yellow_per_shift: int = 1
    keep_x_gray: bool = True


class OfflineSchedulerEngine:
    """Generates and validates offline duty schedules in an Excel template."""

    def __init__(self) -> None:
        self.fill_yellow = PatternFill(fill_type="solid", fgColor="FFFFFF00")
        self.fill_plain = PatternFill(fill_type=None)
        self.fill_gray = PatternFill(fill_type="solid", fgColor="FFA6A6A6")
        self.fill_green = PatternFill(fill_type="solid", fgColor="FFE2EFDA")

    def analyze_workbook(self, input_path: str, config: SchedulerConfig) -> Dict[str, object]:
        wb = openpyxl.load_workbook(input_path, data_only=True)
        ws = wb[config.sheet_name]

        day_cols = self._parse_day_columns(ws)
        staff_all = self._parse_staff(ws)
        core_staff = [s for s in staff_all if s.no <= config.max_core_rank]
        core_names = [s.name for s in core_staff]
        row_by_name = {s.name: s.row for s in core_staff}
        no_by_name = {s.name: s.no for s in core_staff}

        active_days = [d for d in sorted(day_cols) if config.start_day <= d <= config.end_day]

        def code_of(name: str, day: int) -> str:
            v = ws.cell(row_by_name[name], day_cols[day]).value
            return self._norm_code(v)

        coverage_bad = []
        tandem_bad = []
        group_together_bad = []
        m_to_p_pairs = []

        expected_l = len(core_staff) - (config.p_count + config.s_count + config.m_count)

        for day in active_days:
            cnt = Counter(code_of(n, day) for n in core_names)
            if not (
                cnt["P"] == config.p_count
                and cnt["S"] == config.s_count
                and cnt["M"] == config.m_count
                and cnt["L"] == expected_l
            ):
                coverage_bad.append(
                    {
                        "day": day,
                        "P": cnt["P"],
                        "S": cnt["S"],
                        "M": cnt["M"],
                        "L": cnt["L"],
                    }
                )

            for sh in ["P", "S", "M"]:
                participants = [n for n in core_names if code_of(n, day) == sh]
                juniors = [n for n in participants if no_by_name[n] > config.tandem_senior_max_rank]
                seniors = [n for n in participants if no_by_name[n] <= config.tandem_senior_max_rank]

                if juniors and not seniors:
                    tandem_bad.append({"day": day, "shift": sh, "participants": participants})

                if config.uniform_group_ranks:
                    in_group = [
                        n for n in participants if no_by_name[n] in set(config.uniform_group_ranks)
                    ]
                    if len(in_group) > 1:
                        group_together_bad.append(
                            {"day": day, "shift": sh, "rank_group": in_group}
                        )

        for n in core_names:
            for day in active_days[:-1]:
                a = code_of(n, day)
                b = code_of(n, day + 1)
                if a == "M" and b == "P":
                    m_to_p_pairs.append({"name": n, "pair": [day, day + 1]})

        off_by_rank = []
        m_by_rank = []
        mll_missing = []

        for s in core_staff:
            codes = {d: code_of(s.name, d) for d in active_days}
            off = sum(1 for d in active_days if codes[d] == "L")
            night = sum(1 for d in active_days if codes[d] == "M")
            mll = self._mll_hits(codes, active_days)

            off_by_rank.append({"rank": s.no, "name": s.name, "L": off})
            m_by_rank.append({"rank": s.no, "name": s.name, "M": night})
            if not mll:
                mll_missing.append(s.name)

        off_monotonic_bad = []
        for i in range(len(off_by_rank) - 1):
            a = off_by_rank[i]
            b = off_by_rank[i + 1]
            if a["L"] < b["L"]:
                off_monotonic_bad.append(
                    {
                        "higher_rank": a["rank"],
                        "higher_name": a["name"],
                        "higher_off": a["L"],
                        "lower_rank": b["rank"],
                        "lower_name": b["name"],
                        "lower_off": b["L"],
                    }
                )

        color_errors = []
        if config.assign_colors:
            for day in active_days:
                col = day_cols[day]
                for sh in ["P", "S", "M"]:
                    participants = [n for n in core_names if code_of(n, day) == sh]
                    yellow_count = 0
                    nofill_count = 0
                    yellow_not_senior = []

                    for n in participants:
                        cell = ws.cell(row_by_name[n], col)
                        rgb = cell.fill.fgColor.rgb
                        if rgb == "FFFFFF00":
                            yellow_count += 1
                            if no_by_name[n] > config.yellow_only_max_rank:
                                yellow_not_senior.append(n)
                        if cell.fill.fill_type is None:
                            nofill_count += 1

                    if (
                        yellow_count != config.yellow_per_shift
                        or nofill_count != config.polos_per_shift
                        or yellow_not_senior
                    ):
                        color_errors.append(
                            {
                                "day": day,
                                "shift": sh,
                                "yellow": yellow_count,
                                "nofill": nofill_count,
                                "yellow_not_rank_1_11": yellow_not_senior,
                            }
                        )

        return {
            "file": input_path,
            "coverage_bad_count": len(coverage_bad),
            "tandem_bad_count": len(tandem_bad),
            "group_together_bad_count": len(group_together_bad),
            "m_to_p_count": len(m_to_p_pairs),
            "mll_missing_count": len(mll_missing),
            "off_monotonic_bad_count": len(off_monotonic_bad),
            "color_errors_count": len(color_errors),
            "off_by_rank": off_by_rank,
            "m_by_rank": m_by_rank,
            "coverage_bad_preview": coverage_bad[:5],
            "off_monotonic_bad_preview": off_monotonic_bad[:5],
            "color_errors_preview": color_errors[:5],
        }

    def generate_schedule(
        self,
        input_path: str,
        output_path: str,
        config: SchedulerConfig,
        progress_callback: Optional[Callable[[Dict[str, object]], None]] = None,
        save_fallback_paths: Optional[List[str]] = None,
    ) -> Dict[str, object]:
        started = time.perf_counter()
        self._emit_progress(
            progress_callback,
            phase="prepare",
            progress=0.0,
            message="Preparing workbook and initial schedule",
            elapsed_sec=0.0,
            eta_sec=None,
            iteration=0,
            total_iterations=config.iterations,
            best_score=None,
            temperature=config.initial_temperature,
        )

        random.seed(config.random_seed)

        wb = openpyxl.load_workbook(input_path)
        ws = wb[config.sheet_name]

        day_cols = self._parse_day_columns(ws)
        all_staff = self._parse_staff(ws)
        core_staff = [s for s in all_staff if s.no <= config.max_core_rank]
        core_staff = sorted(core_staff, key=lambda s: s.no)

        core_names = [s.name for s in core_staff]
        row_by_name = {s.name: s.row for s in core_staff}
        no_by_name = {s.name: s.no for s in core_staff}
        name_by_no = {s.no: s.name for s in core_staff}

        active_days = [d for d in sorted(day_cols) if config.start_day <= d <= config.end_day]
        if not active_days:
            raise ValueError("No active days found in selected day range")

        expected_l = len(core_staff) - (config.p_count + config.s_count + config.m_count)
        if expected_l < 0:
            raise ValueError("Coverage is larger than available core staff count")

        # Build initial schedule from file, then rebuild invalid days if needed.
        schedule = {}
        for s in core_staff:
            codes = {}
            for d in active_days:
                v = ws.cell(s.row, day_cols[d]).value
                code = self._norm_code(v)
                if code not in {"P", "S", "M", "L"}:
                    code = "L"
                codes[d] = code
            schedule[s.name] = {"no": s.no, "codes": codes}

        for d in active_days:
            cnt = Counter(schedule[n]["codes"][d] for n in core_names)
            if not (
                cnt["P"] == config.p_count
                and cnt["S"] == config.s_count
                and cnt["M"] == config.m_count
                and cnt["L"] == expected_l
            ):
                self._randomize_day(schedule, core_names, d, config)

        uniform_group = self._resolve_uniform_group(config, core_staff)
        total_off_required = expected_l * len(active_days)
        off_targets = self._resolve_off_targets(
            config,
            core_staff,
            total_off_required=total_off_required,
            uniform_group=uniform_group,
        )

        # Simulated annealing with same-day swaps.
        current = copy.deepcopy(schedule)
        current_score = self._score(
            current,
            core_names,
            name_by_no,
            no_by_name,
            active_days,
            off_targets,
            uniform_group,
            config,
        )
        best = copy.deepcopy(current)
        best_score = current_score

        t = max(config.initial_temperature, 0.01)
        progress_step = max(1, min(2000, max(config.iterations, 1) // 120))

        for it in range(config.iterations):
            day = random.choice(active_days)
            a, b = random.sample(core_names, 2)
            ca = current[a]["codes"][day]
            cb = current[b]["codes"][day]
            if ca == cb:
                continue

            current[a]["codes"][day], current[b]["codes"][day] = cb, ca

            new_score = self._score(
                current,
                core_names,
                name_by_no,
                no_by_name,
                active_days,
                off_targets,
                uniform_group,
                config,
            )
            delta = new_score - current_score

            if delta >= 0 or random.random() < math.exp(delta / max(t, 0.0001)):
                current_score = new_score
                if new_score > best_score:
                    best_score = new_score
                    best = copy.deepcopy(current)
            else:
                current[a]["codes"][day], current[b]["codes"][day] = ca, cb

            if it > 0 and it % max(config.cooling_step, 1) == 0:
                t *= config.cooling_rate

            if it % progress_step == 0 or it == config.iterations - 1:
                elapsed = time.perf_counter() - started
                current_iter = it + 1
                progress = current_iter / max(config.iterations, 1)
                eta = None
                if progress > 0:
                    eta = max(0.0, (elapsed / progress) - elapsed)

                self._emit_progress(
                    progress_callback,
                    phase="optimize",
                    progress=progress,
                    message="Optimizing schedule",
                    elapsed_sec=elapsed,
                    eta_sec=eta,
                    iteration=current_iter,
                    total_iterations=config.iterations,
                    best_score=best_score,
                    temperature=t,
                )

        self._emit_progress(
            progress_callback,
            phase="save",
            progress=0.995,
            message="Writing output file and running final analysis",
            elapsed_sec=time.perf_counter() - started,
            eta_sec=0.0,
            iteration=config.iterations,
            total_iterations=config.iterations,
            best_score=best_score,
            temperature=t,
        )

        # Write optimized codes.
        for n in core_names:
            r = row_by_name[n]
            for d in active_days:
                ws.cell(r, day_cols[d]).value = best[n]["codes"][d]

        # Optional coloring policy.
        if config.assign_colors:
            self._apply_coloring_policy(
                ws,
                day_cols,
                active_days,
                all_staff,
                core_staff,
                best,
                config,
            )

        save_targets = [str(output_path)]
        if save_fallback_paths:
            for p in save_fallback_paths:
                if not p:
                    continue
                sp = str(p)
                if sp not in save_targets:
                    save_targets.append(sp)

        save_errors: List[str] = []
        actual_output_path: Optional[str] = None

        for idx, target in enumerate(save_targets):
            try:
                if idx > 0:
                    self._emit_progress(
                        progress_callback,
                        phase="save",
                        progress=0.997,
                        message=f"Retry saving output: {target}",
                        elapsed_sec=time.perf_counter() - started,
                        eta_sec=0.0,
                        iteration=config.iterations,
                        total_iterations=config.iterations,
                        best_score=best_score,
                        temperature=t,
                    )
                wb.save(target)
                actual_output_path = target
                break
            except PermissionError as exc:
                save_errors.append(f"{target}: {exc}")

        if actual_output_path is None:
            joined = "\n".join(save_errors)
            raise PermissionError(
                "Failed to save workbook to any output path.\n"
                f"Requested output: {output_path}\n"
                f"Tried paths:\n{joined}"
            )

        report = self.analyze_workbook(actual_output_path, config)
        report["source_file"] = input_path
        report["output_file"] = actual_output_path
        report["_requested_output_file"] = output_path
        report["_save_fallback_used"] = actual_output_path != str(output_path)
        if save_errors:
            report["_save_errors"] = save_errors
        report["solver_score"] = best_score

        self._emit_progress(
            progress_callback,
            phase="done",
            progress=1.0,
            message="Done",
            elapsed_sec=time.perf_counter() - started,
            eta_sec=0.0,
            iteration=config.iterations,
            total_iterations=config.iterations,
            best_score=best_score,
            temperature=t,
        )

        return report

    def _parse_day_columns(self, ws) -> Dict[int, int]:
        out = {}
        for c in range(1, ws.max_column + 1):
            v = ws.cell(2, c).value
            try:
                d = int(v)
                if 1 <= d <= 31 and d not in out:
                    out[d] = c
            except Exception:
                continue
        if not out:
            raise ValueError("Day columns not found in header row 2")
        return out

    def _parse_staff(self, ws) -> List[StaffMember]:
        staff = []
        for r in range(3, ws.max_row + 1):
            no = ws.cell(r, 1).value
            name = ws.cell(r, 2).value
            if isinstance(no, (int, float)) and str(name or "").strip():
                staff.append(StaffMember(no=int(no), name=str(name).strip(), row=r))
        if not staff:
            raise ValueError("No staff rows found (expects NO in col A and NAMA in col B)")
        return sorted(staff, key=lambda s: s.no)

    def _norm_code(self, value) -> str:
        code = str(value).strip().upper() if value is not None else ""
        if code == "O":
            return "L"
        return code

    def _randomize_day(
        self,
        schedule: Dict[str, Dict[str, object]],
        core_names: List[str],
        day: int,
        config: SchedulerConfig,
    ) -> None:
        names = core_names[:]
        random.shuffle(names)

        p_slice = names[: config.p_count]
        s_slice = names[config.p_count : config.p_count + config.s_count]
        m_slice = names[
            config.p_count + config.s_count : config.p_count + config.s_count + config.m_count
        ]

        for n in core_names:
            schedule[n]["codes"][day] = "L"
        for n in p_slice:
            schedule[n]["codes"][day] = "P"
        for n in s_slice:
            schedule[n]["codes"][day] = "S"
        for n in m_slice:
            schedule[n]["codes"][day] = "M"

    def _resolve_off_targets(
        self,
        config: SchedulerConfig,
        core_staff: List[StaffMember],
        total_off_required: int,
        uniform_group: List[int],
    ) -> Dict[str, int]:
        ordered_staff = sorted(core_staff, key=lambda s: s.no)

        if config.off_targets_by_rank and len(config.off_targets_by_rank) >= len(ordered_staff):
            base_values = []
            for s in ordered_staff:
                idx = s.no - 1
                if 0 <= idx < len(config.off_targets_by_rank):
                    base_values.append(int(config.off_targets_by_rank[idx]))
                else:
                    base_values.append(int(config.off_targets_by_rank[-1]))
        else:
            # Default profile used in the recent schedule iterations for 27 active days.
            default_14 = [12, 12, 11, 11, 10, 10, 9, 9, 9, 9, 9, 8, 8, 8]
            base_values = []
            for s in ordered_staff:
                idx = s.no - 1
                if 0 <= idx < len(default_14):
                    base_values.append(int(default_14[idx]))
                else:
                    base_values.append(int(default_14[-1]))

        adjusted_values = self._rebalance_off_targets(
            ordered_staff=ordered_staff,
            base_values=base_values,
            total_off_required=total_off_required,
            uniform_group=uniform_group,
        )

        return {staff.name: adjusted_values[i] for i, staff in enumerate(ordered_staff)}

    def _rebalance_off_targets(
        self,
        ordered_staff: List[StaffMember],
        base_values: List[int],
        total_off_required: int,
        uniform_group: List[int],
    ) -> List[int]:
        targets = [max(0, int(v)) for v in base_values]
        if not targets:
            return targets

        group_set = set(uniform_group)
        non_group_indices = [i for i, s in enumerate(ordered_staff) if s.no not in group_set]
        group_indices = [i for i, s in enumerate(ordered_staff) if s.no in group_set]

        diff = int(total_off_required - sum(targets))

        # Add extra off-days by prioritizing higher ranks outside the uniform group.
        if diff > 0:
            priority = non_group_indices if non_group_indices else list(range(len(targets)))
            cursor = 0
            while diff > 0 and priority:
                idx = priority[cursor % len(priority)]
                targets[idx] += 1
                diff -= 1
                cursor += 1

        # Remove off-days from lower ranks first outside the uniform group.
        elif diff < 0:
            need = -diff
            priority = list(reversed(non_group_indices)) if non_group_indices else list(reversed(range(len(targets))))
            cursor = 0
            guard = 0
            while need > 0 and priority and guard < 200000:
                idx = priority[cursor % len(priority)]
                if targets[idx] > 0:
                    targets[idx] -= 1
                    need -= 1
                cursor += 1
                guard += 1

            # If still needed and uniform group exists, reduce them evenly.
            while need > 0 and group_indices and all(targets[idx] > 0 for idx in group_indices):
                for idx in group_indices:
                    if need <= 0:
                        break
                    targets[idx] -= 1
                    need -= 1

        # Ensure group equality by aligning all group ranks to the minimum in group.
        if group_indices:
            group_min = min(targets[idx] for idx in group_indices)
            for idx in group_indices:
                targets[idx] = group_min

        # Enforce monotonic seniority: higher rank index should not have fewer off-days.
        for i in range(1, len(targets)):
            if targets[i - 1] < targets[i]:
                targets[i] = targets[i - 1]

        # Re-add any remaining required total (from clamping) to top ranks.
        remain = int(total_off_required - sum(targets))
        add_priority = non_group_indices if non_group_indices else list(range(len(targets)))
        cursor = 0
        while remain > 0 and add_priority:
            idx = add_priority[cursor % len(add_priority)]
            targets[idx] += 1
            remain -= 1
            cursor += 1

        return targets

    def _resolve_uniform_group(
        self,
        config: SchedulerConfig,
        core_staff: List[StaffMember],
    ) -> List[int]:
        all_ranks = {s.no for s in core_staff}
        if config.uniform_group_ranks:
            return [r for r in config.uniform_group_ranks if r in all_ranks]
        return [r for r in [12, 13, 14] if r in all_ranks]

    def _mll_hits(self, codes: Dict[int, str], active_days: List[int]) -> List[int]:
        hits = []
        for day in active_days:
            if day + 2 not in codes:
                continue
            if codes[day] == "M" and codes[day + 1] == "L" and codes[day + 2] == "L":
                hits.append(day)
        return hits

    def _score(
        self,
        schedule: Dict[str, Dict[str, object]],
        core_names: List[str],
        name_by_no: Dict[int, str],
        no_by_name: Dict[str, int],
        active_days: List[int],
        off_targets: Dict[str, int],
        uniform_group: List[int],
        config: SchedulerConfig,
    ) -> float:
        expected_l = len(core_names) - (config.p_count + config.s_count + config.m_count)

        # Hard counters.
        coverage_bad = 0
        tandem_bad = 0
        group_together_bad = 0
        m_to_p_bad = 0

        off = {n: 0 for n in core_names}
        nights = {n: 0 for n in core_names}

        for day in active_days:
            cnt = Counter(schedule[n]["codes"][day] for n in core_names)
            if not (
                cnt["P"] == config.p_count
                and cnt["S"] == config.s_count
                and cnt["M"] == config.m_count
                and cnt["L"] == expected_l
            ):
                coverage_bad += 1

            for sh in ["P", "S", "M"]:
                participants = [n for n in core_names if schedule[n]["codes"][day] == sh]
                if config.enforce_tandem:
                    juniors = [n for n in participants if no_by_name[n] > config.tandem_senior_max_rank]
                    seniors = [n for n in participants if no_by_name[n] <= config.tandem_senior_max_rank]
                    if juniors and not seniors:
                        tandem_bad += 1

                if config.enforce_rank_group_not_together and uniform_group:
                    in_group = [n for n in participants if no_by_name[n] in set(uniform_group)]
                    if len(in_group) > 1:
                        group_together_bad += 1

            for n in core_names:
                code = schedule[n]["codes"][day]
                if code == "L":
                    off[n] += 1
                if code == "M":
                    nights[n] += 1

        if config.enforce_no_m_to_p:
            for n in core_names:
                for day in active_days[:-1]:
                    if (
                        schedule[n]["codes"][day] == "M"
                        and schedule[n]["codes"][day + 1] == "P"
                    ):
                        m_to_p_bad += 1

        # Soft/medium penalties.
        penalties = 0.0
        penalties += coverage_bad * 180000
        penalties += tandem_bad * 180000
        penalties += group_together_bad * 220000
        penalties += m_to_p_bad * 140000

        if config.enforce_top_rank_night_cap:
            top_ranks = [r for r in range(1, config.top_rank_count + 1) if r in name_by_no]
            top_over = 0
            for r in top_ranks:
                n = name_by_no[r]
                top_over += max(0, nights[n] - config.top_rank_max_night)
            penalties += top_over * 140000

        if config.enforce_off_monotonic:
            off_mono_bad = 0
            off_mono_mag = 0
            for rank in range(1, len(core_names)):
                if rank not in name_by_no or rank + 1 not in name_by_no:
                    continue
                a = name_by_no[rank]
                b = name_by_no[rank + 1]
                if off[a] < off[b]:
                    off_mono_bad += 1
                    off_mono_mag += off[b] - off[a]
            penalties += off_mono_bad * 260000
            penalties += off_mono_mag * 40000

        if config.enforce_night_monotonic:
            night_mono_bad = 0
            night_mono_mag = 0
            for rank in range(1, len(core_names)):
                if rank not in name_by_no or rank + 1 not in name_by_no:
                    continue
                a = name_by_no[rank]
                b = name_by_no[rank + 1]
                if nights[a] > nights[b]:
                    night_mono_bad += 1
                    night_mono_mag += nights[a] - nights[b]
            penalties += night_mono_bad * 60000
            penalties += night_mono_mag * 9000

        if config.enforce_uniform_group_off and uniform_group:
            group_off = [off[name_by_no[r]] for r in uniform_group if r in name_by_no]
            if group_off:
                penalties += (max(group_off) - min(group_off)) * 240000

        if config.enforce_uniform_group_night and uniform_group:
            group_night = [nights[name_by_no[r]] for r in uniform_group if r in name_by_no]
            if group_night:
                penalties += (max(group_night) - min(group_night)) * 130000

        # Off target proximity.
        off_target_pen = 0
        for n in core_names:
            off_target_pen += abs(off[n] - off_targets.get(n, off[n]))
        penalties += off_target_pen * 3500

        if config.enforce_mll_each:
            missing = 0
            for n in core_names:
                hits = self._mll_hits(schedule[n]["codes"], active_days)
                if not hits:
                    missing += 1
            penalties += missing * 50000

        # Optional max consecutive work soft penalty.
        streak_over = 0
        for n in core_names:
            max_streak = 0
            cur = 0
            for day in active_days:
                if schedule[n]["codes"][day] in {"P", "S", "M"}:
                    cur += 1
                    max_streak = max(max_streak, cur)
                else:
                    cur = 0
            streak_over += max(0, max_streak - config.max_consecutive_work)
        penalties += streak_over * 500

        return -penalties

    def _apply_coloring_policy(
        self,
        ws,
        day_cols: Dict[int, int],
        active_days: List[int],
        all_staff: List[StaffMember],
        core_staff: List[StaffMember],
        best_schedule: Dict[str, Dict[str, object]],
        config: SchedulerConfig,
    ) -> None:
        core_names = [s.name for s in core_staff]
        row_by_name = {s.name: s.row for s in core_staff}
        no_by_name = {s.name: s.no for s in core_staff}

        # Keep X as gray on days 1-4.
        if config.keep_x_gray:
            for n in core_names:
                r = row_by_name[n]
                for day in range(1, 5):
                    if day not in day_cols:
                        continue
                    col = day_cols[day]
                    code = self._norm_code(ws.cell(r, col).value)
                    if code == "X":
                        ws.cell(r, col).fill = self.fill_gray

        # Active day color assignment.
        for day in active_days:
            col = day_cols[day]

            # L is always plain/no-fill.
            for n in core_names:
                if best_schedule[n]["codes"][day] == "L":
                    ws.cell(row_by_name[n], col).fill = self.fill_plain

            for sh in ["P", "S", "M"]:
                participants = [n for n in core_names if best_schedule[n]["codes"][day] == sh]
                if not participants:
                    continue

                seniors = [n for n in participants if no_by_name[n] <= config.yellow_only_max_rank]
                if seniors:
                    yellow = sorted(seniors, key=lambda x: no_by_name[x])[0]
                else:
                    yellow = sorted(participants, key=lambda x: no_by_name[x])[0]

                polos = [n for n in participants if n != yellow]

                ws.cell(row_by_name[yellow], col).fill = self.fill_yellow
                for n in polos:
                    ws.cell(row_by_name[n], col).fill = self.fill_plain

        # Optional style for rank >= 15 if present (magang row from current template style).
        higher_rows = [s for s in all_staff if s.no > config.max_core_rank]
        for s in higher_rows:
            for day in active_days:
                col = day_cols[day]
                code = self._norm_code(ws.cell(s.row, col).value)
                if code in {"P", "S", "M", "L"}:
                    ws.cell(s.row, col).fill = self.fill_green

    @staticmethod
    def _emit_progress(
        progress_callback: Optional[Callable[[Dict[str, object]], None]],
        **payload: object,
    ) -> None:
        if not progress_callback:
            return
        try:
            progress_callback(payload)
        except Exception:
            # Progress updates must never interrupt optimization.
            pass

    @staticmethod
    def report_to_pretty_json(report: Dict[str, object]) -> str:
        return json.dumps(report, indent=2, ensure_ascii=True)
