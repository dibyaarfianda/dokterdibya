from __future__ import annotations

import csv
import json
import threading
import traceback
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from scheduler_engine import OfflineSchedulerEngine, SchedulerConfig
except ModuleNotFoundError:
    from .scheduler_engine import OfflineSchedulerEngine, SchedulerConfig


class SchedulerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Offline Jadwal Jaga Builder")
        self.root.geometry("1150x760")

        self.engine = OfflineSchedulerEngine()

        self._build_vars()
        self._build_ui()

    def _build_vars(self) -> None:
        self.input_path_var = tk.StringVar()
        self.output_path_var = tk.StringVar()
        self.export_folder_var = tk.StringVar()

        self.sheet_name_var = tk.StringVar(value="JADWAL BARU")
        self.start_day_var = tk.StringVar(value="5")
        self.end_day_var = tk.StringVar(value="31")

        self.p_count_var = tk.StringVar(value="3")
        self.s_count_var = tk.StringVar(value="3")
        self.m_count_var = tk.StringVar(value="3")

        self.iterations_var = tk.StringVar(value="60000")
        self.seed_var = tk.StringVar(value="707")
        self.temperature_var = tk.StringVar(value="4.5")

        self.top_rank_count_var = tk.StringVar(value="2")
        self.top_rank_max_night_var = tk.StringVar(value="3")
        self.max_core_rank_var = tk.StringVar(value="14")

        self.off_targets_var = tk.StringVar(
            value="12,12,11,11,10,10,9,9,9,9,9,8,8,8"
        )
        self.uniform_group_var = tk.StringVar(value="12,13,14")

        self.enforce_no_m_to_p_var = tk.BooleanVar(value=True)
        self.enforce_mll_each_var = tk.BooleanVar(value=True)
        self.enforce_rank_group_not_together_var = tk.BooleanVar(value=True)
        self.enforce_tandem_var = tk.BooleanVar(value=True)
        self.enforce_top_rank_night_cap_var = tk.BooleanVar(value=True)
        self.enforce_uniform_group_off_var = tk.BooleanVar(value=True)
        self.enforce_uniform_group_night_var = tk.BooleanVar(value=True)
        self.enforce_night_monotonic_var = tk.BooleanVar(value=True)
        self.enforce_off_monotonic_var = tk.BooleanVar(value=True)
        self.assign_colors_var = tk.BooleanVar(value=True)

        self.export_json_var = tk.BooleanVar(value=True)
        self.export_csv_var = tk.BooleanVar(value=True)

        self.progress_var = tk.DoubleVar(value=0.0)
        self.progress_text_var = tk.StringVar(value="Idle")
        self._is_generating = False

    def _build_ui(self) -> None:
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(3, weight=1)

        path_frame = ttk.LabelFrame(self.root, text="Files")
        path_frame.grid(row=0, column=0, sticky="ew", padx=10, pady=8)
        path_frame.columnconfigure(1, weight=1)

        ttk.Label(path_frame, text="Input Excel").grid(row=0, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(path_frame, textvariable=self.input_path_var).grid(
            row=0, column=1, sticky="ew", padx=6, pady=4
        )
        ttk.Button(path_frame, text="Browse", command=self._browse_input).grid(
            row=0, column=2, padx=6, pady=4
        )

        ttk.Label(path_frame, text="Output Excel").grid(row=1, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(path_frame, textvariable=self.output_path_var).grid(
            row=1, column=1, sticky="ew", padx=6, pady=4
        )
        ttk.Button(path_frame, text="Browse", command=self._browse_output).grid(
            row=1, column=2, padx=6, pady=4
        )

        ttk.Label(path_frame, text="Report Folder").grid(row=2, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(path_frame, textvariable=self.export_folder_var).grid(
            row=2, column=1, sticky="ew", padx=6, pady=4
        )
        ttk.Button(path_frame, text="Browse", command=self._browse_export_folder).grid(
            row=2, column=2, padx=6, pady=4
        )

        ttk.Checkbutton(path_frame, text="Auto Export JSON", variable=self.export_json_var).grid(
            row=3, column=1, sticky="w", padx=6, pady=4
        )
        ttk.Checkbutton(path_frame, text="Auto Export CSV", variable=self.export_csv_var).grid(
            row=3, column=1, sticky="e", padx=6, pady=4
        )

        config_frame = ttk.LabelFrame(self.root, text="Config")
        config_frame.grid(row=1, column=0, sticky="ew", padx=10, pady=6)

        self._add_labeled_entry(config_frame, "Sheet", self.sheet_name_var, 0, 0)
        self._add_labeled_entry(config_frame, "Start Day", self.start_day_var, 0, 2)
        self._add_labeled_entry(config_frame, "End Day", self.end_day_var, 0, 4)

        self._add_labeled_entry(config_frame, "P", self.p_count_var, 1, 0)
        self._add_labeled_entry(config_frame, "S", self.s_count_var, 1, 2)
        self._add_labeled_entry(config_frame, "M", self.m_count_var, 1, 4)

        self._add_labeled_entry(config_frame, "Iterations", self.iterations_var, 2, 0)
        self._add_labeled_entry(config_frame, "Seed", self.seed_var, 2, 2)
        self._add_labeled_entry(config_frame, "Temp", self.temperature_var, 2, 4)

        self._add_labeled_entry(config_frame, "Top Rank Count", self.top_rank_count_var, 3, 0)
        self._add_labeled_entry(config_frame, "Top Rank Max Night", self.top_rank_max_night_var, 3, 2)
        self._add_labeled_entry(config_frame, "Max Core Rank", self.max_core_rank_var, 3, 4)

        self._add_labeled_entry(config_frame, "Off Targets (CSV)", self.off_targets_var, 4, 0, span=5)
        self._add_labeled_entry(config_frame, "Uniform Group Ranks (CSV)", self.uniform_group_var, 5, 0, span=5)

        flags_frame = ttk.LabelFrame(self.root, text="Rules")
        flags_frame.grid(row=2, column=0, sticky="ew", padx=10, pady=6)

        flags = [
            ("No M->P", self.enforce_no_m_to_p_var),
            ("Each Staff Has M-L-L", self.enforce_mll_each_var),
            ("Rank Group Not Together", self.enforce_rank_group_not_together_var),
            ("Tandem Required", self.enforce_tandem_var),
            ("Top Rank Night Cap", self.enforce_top_rank_night_cap_var),
            ("Uniform Group Off", self.enforce_uniform_group_off_var),
            ("Uniform Group Night", self.enforce_uniform_group_night_var),
            ("Night Monotonic", self.enforce_night_monotonic_var),
            ("Off Monotonic", self.enforce_off_monotonic_var),
            ("Apply Colors", self.assign_colors_var),
        ]

        for idx, (label, var) in enumerate(flags):
            r = idx // 5
            c = idx % 5
            ttk.Checkbutton(flags_frame, text=label, variable=var).grid(
                row=r, column=c, sticky="w", padx=10, pady=4
            )

        action_frame = ttk.Frame(self.root)
        action_frame.grid(row=3, column=0, sticky="nsew", padx=10, pady=8)
        action_frame.columnconfigure(0, weight=1)
        action_frame.rowconfigure(1, weight=1)

        button_bar = ttk.Frame(action_frame)
        button_bar.grid(row=0, column=0, sticky="ew")

        self.preset_btn = ttk.Button(
            button_bar,
            text="Apply Preset: Final VK",
            command=self._apply_preset_final_vk,
        )
        self.preset_btn.pack(side="left", padx=4)

        self.analyze_btn = ttk.Button(button_bar, text="Analyze Input", command=self._on_analyze)
        self.analyze_btn.pack(side="left", padx=4)

        self.generate_btn = ttk.Button(button_bar, text="Generate + Save", command=self._on_generate)
        self.generate_btn.pack(side="left", padx=4)

        self.copy_btn = ttk.Button(button_bar, text="Copy Report", command=self._copy_report)
        self.copy_btn.pack(side="left", padx=4)

        progress_frame = ttk.Frame(action_frame)
        progress_frame.grid(row=1, column=0, sticky="ew", pady=(6, 2))
        progress_frame.columnconfigure(0, weight=1)

        self.progress_bar = ttk.Progressbar(
            progress_frame,
            orient="horizontal",
            mode="determinate",
            maximum=100,
            variable=self.progress_var,
        )
        self.progress_bar.grid(row=0, column=0, sticky="ew", padx=(0, 8))

        ttk.Label(progress_frame, textvariable=self.progress_text_var, width=56, anchor="w").grid(
            row=0, column=1, sticky="w"
        )

        self.output_text = tk.Text(action_frame, wrap="word")
        self.output_text.grid(row=2, column=0, sticky="nsew", pady=6)
        scroll = ttk.Scrollbar(action_frame, command=self.output_text.yview)
        scroll.grid(row=2, column=1, sticky="ns")
        self.output_text.configure(yscrollcommand=scroll.set)
        action_frame.rowconfigure(2, weight=1)

    def _add_labeled_entry(
        self,
        parent: ttk.Widget,
        label: str,
        var: tk.StringVar,
        row: int,
        col: int,
        span: int = 1,
    ) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=col, sticky="w", padx=6, pady=4)
        entry = ttk.Entry(parent, textvariable=var)
        entry.grid(row=row, column=col + 1, sticky="ew", padx=6, pady=4, columnspan=span)
        parent.columnconfigure(col + 1, weight=1)

    def _browse_input(self) -> None:
        p = filedialog.askopenfilename(
            title="Select input schedule file",
            filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")],
        )
        if p:
            self.input_path_var.set(p)
            if not self.output_path_var.get().strip():
                self.output_path_var.set(self._suggest_output_path(p))
            if not self.export_folder_var.get().strip():
                self.export_folder_var.set(str(Path(p).parent))

    def _browse_output(self) -> None:
        p = filedialog.asksaveasfilename(
            title="Save output schedule as",
            defaultextension=".xlsx",
            filetypes=[("Excel files", "*.xlsx")],
        )
        if p:
            self.output_path_var.set(p)

    def _browse_export_folder(self) -> None:
        p = filedialog.askdirectory(title="Select report export folder")
        if p:
            self.export_folder_var.set(p)

    def _suggest_output_path(self, input_path: str) -> str:
        path = Path(input_path)
        return str(path.with_name(path.stem + " - generated.xlsx"))

    def _set_busy(self, busy: bool) -> None:
        state = "disabled" if busy else "normal"
        self.preset_btn.configure(state=state)
        self.analyze_btn.configure(state=state)
        self.generate_btn.configure(state=state)
        self.copy_btn.configure(state=state)
        self.root.configure(cursor="watch" if busy else "")

    def _append_report(self, title: str, payload: object) -> None:
        self.output_text.insert("end", f"\n=== {title} ===\n")
        self.output_text.insert("end", f"{payload}\n")
        self.output_text.see("end")

    def _parse_int_list(self, text: str) -> List[int]:
        values = []
        for item in text.split(","):
            item = item.strip()
            if not item:
                continue
            values.append(int(item))
        return values

    def _build_config(self) -> SchedulerConfig:
        return SchedulerConfig(
            sheet_name=self.sheet_name_var.get().strip() or "JADWAL BARU",
            start_day=int(self.start_day_var.get().strip()),
            end_day=int(self.end_day_var.get().strip()),
            max_core_rank=int(self.max_core_rank_var.get().strip()),
            p_count=int(self.p_count_var.get().strip()),
            s_count=int(self.s_count_var.get().strip()),
            m_count=int(self.m_count_var.get().strip()),
            iterations=int(self.iterations_var.get().strip()),
            initial_temperature=float(self.temperature_var.get().strip()),
            random_seed=int(self.seed_var.get().strip()),
            top_rank_count=int(self.top_rank_count_var.get().strip()),
            top_rank_max_night=int(self.top_rank_max_night_var.get().strip()),
            off_targets_by_rank=self._parse_int_list(self.off_targets_var.get()),
            uniform_group_ranks=self._parse_int_list(self.uniform_group_var.get()),
            enforce_no_m_to_p=self.enforce_no_m_to_p_var.get(),
            enforce_mll_each=self.enforce_mll_each_var.get(),
            enforce_rank_group_not_together=self.enforce_rank_group_not_together_var.get(),
            enforce_tandem=self.enforce_tandem_var.get(),
            enforce_top_rank_night_cap=self.enforce_top_rank_night_cap_var.get(),
            enforce_uniform_group_off=self.enforce_uniform_group_off_var.get(),
            enforce_uniform_group_night=self.enforce_uniform_group_night_var.get(),
            enforce_night_monotonic=self.enforce_night_monotonic_var.get(),
            enforce_off_monotonic=self.enforce_off_monotonic_var.get(),
            assign_colors=self.assign_colors_var.get(),
        )

    def _apply_preset_final_vk(self) -> None:
        # Fast preset based on the latest approved VK constraints.
        self.sheet_name_var.set("JADWAL BARU")
        self.start_day_var.set("5")
        self.end_day_var.set("31")

        self.max_core_rank_var.set("14")
        self.p_count_var.set("3")
        self.s_count_var.set("3")
        self.m_count_var.set("3")

        self.iterations_var.set("60000")
        self.seed_var.set("707")
        self.temperature_var.set("4.5")

        self.top_rank_count_var.set("2")
        self.top_rank_max_night_var.set("3")
        self.off_targets_var.set("12,12,11,11,10,10,9,9,9,9,9,8,8,8")
        self.uniform_group_var.set("12,13,14")

        self.enforce_no_m_to_p_var.set(True)
        self.enforce_mll_each_var.set(True)
        self.enforce_rank_group_not_together_var.set(True)
        self.enforce_tandem_var.set(True)
        self.enforce_top_rank_night_cap_var.set(True)
        self.enforce_uniform_group_off_var.set(True)
        self.enforce_uniform_group_night_var.set(True)
        self.enforce_night_monotonic_var.set(True)
        self.enforce_off_monotonic_var.set(True)
        self.assign_colors_var.set(True)

        self.progress_var.set(0.0)
        self.progress_text_var.set("Preset Final VK applied")
        self._append_report("Preset", "Final VK preset has been applied.")

    def _run_background(self, worker, generate_mode: bool = False) -> None:
        self._set_busy(True)
        self._is_generating = generate_mode
        if generate_mode:
            self.progress_var.set(0.0)
            self.progress_text_var.set("Starting optimization...")

        def runner() -> None:
            try:
                result = worker()
                self.root.after(0, lambda: self._on_worker_success(result))
            except Exception as exc:
                msg = f"{exc}\n\n{traceback.format_exc()}"
                self.root.after(0, lambda: self._on_worker_error(msg))

        threading.Thread(target=runner, daemon=True).start()

    def _on_worker_success(self, result: object) -> None:
        self._set_busy(False)
        self._is_generating = False

        if isinstance(result, dict) and "kind" in result and "report" in result:
            report = result["report"]
            report_text = OfflineSchedulerEngine.report_to_pretty_json(report)
            self._append_report("Result", report_text)

            if result["kind"] == "generate":
                self._auto_export_report(report)
                self.progress_var.set(100.0)
                self.progress_text_var.set("Generate complete")
            return

        self._append_report("Result", result)

    def _on_worker_error(self, err: str) -> None:
        self._set_busy(False)
        self._is_generating = False
        self.progress_text_var.set("Error")
        self._append_report("Error", err)
        messagebox.showerror("Error", err)

    def _format_seconds(self, seconds: object) -> str:
        if seconds is None:
            return "-"
        try:
            s = max(0, int(float(seconds)))
        except Exception:
            return "-"
        m, sec = divmod(s, 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h:02d}:{m:02d}:{sec:02d}"
        return f"{m:02d}:{sec:02d}"

    def _on_progress(self, payload: dict) -> None:
        if not self._is_generating:
            return

        def apply_progress() -> None:
            progress = max(0.0, min(1.0, float(payload.get("progress", 0.0))))
            self.progress_var.set(progress * 100.0)

            phase = str(payload.get("phase", "optimize"))
            iteration = payload.get("iteration")
            total_iterations = payload.get("total_iterations")
            elapsed = self._format_seconds(payload.get("elapsed_sec"))
            eta = self._format_seconds(payload.get("eta_sec"))

            if phase == "optimize" and iteration is not None and total_iterations is not None:
                text = f"Optimizing {iteration}/{total_iterations} | elapsed {elapsed} | eta {eta}"
            elif phase == "save":
                text = f"Saving output | elapsed {elapsed}"
            elif phase == "done":
                text = f"Done | elapsed {elapsed}"
            else:
                text = str(payload.get("message", "Working..."))

            self.progress_text_var.set(text)

        self.root.after(0, apply_progress)

    def _write_report_csv(self, path: Path, report: dict) -> None:
        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["section", "field", "value"])

            scalar_keys = [
                k for k, v in report.items() if not isinstance(v, (dict, list))
            ]
            for key in sorted(scalar_keys):
                writer.writerow(["summary", key, report[key]])

            writer.writerow([])
            writer.writerow(["off_by_rank", "rank", "name", "L"])
            for row in report.get("off_by_rank", []):
                writer.writerow(["off_by_rank", row.get("rank"), row.get("name"), row.get("L")])

            writer.writerow([])
            writer.writerow(["m_by_rank", "rank", "name", "M"])
            for row in report.get("m_by_rank", []):
                writer.writerow(["m_by_rank", row.get("rank"), row.get("name"), row.get("M")])

    def _auto_export_report(self, report: dict) -> None:
        if not self.export_json_var.get() and not self.export_csv_var.get():
            return

        configured_folder = self.export_folder_var.get().strip()
        if configured_folder:
            export_dir = Path(configured_folder)
        else:
            source = report.get("output_file") or report.get("source_file")
            export_dir = Path(str(source)).parent if source else Path.cwd()

        export_dir.mkdir(parents=True, exist_ok=True)

        source_name = report.get("output_file") or report.get("source_file") or "schedule"
        base_stem = Path(str(source_name)).stem
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        base_name = f"{base_stem} - report - {stamp}"

        exported = []

        if self.export_json_var.get():
            json_path = export_dir / f"{base_name}.json"
            with json_path.open("w", encoding="utf-8") as f:
                json.dump(report, f, indent=2, ensure_ascii=True)
            exported.append(str(json_path))

        if self.export_csv_var.get():
            csv_path = export_dir / f"{base_name}.csv"
            self._write_report_csv(csv_path, report)
            exported.append(str(csv_path))

        if exported:
            self._append_report("Export", "\n".join(exported))

    def _on_analyze(self) -> None:
        input_path = self.input_path_var.get().strip()
        if not input_path:
            messagebox.showwarning("Input required", "Please choose an input Excel file first.")
            return

        config = self._build_config()

        def work():
            report = self.engine.analyze_workbook(input_path, config)
            return {"kind": "analyze", "report": report}

        self._run_background(work, generate_mode=False)

    def _on_generate(self) -> None:
        input_path = self.input_path_var.get().strip()
        if not input_path:
            messagebox.showwarning("Input required", "Please choose an input Excel file first.")
            return

        output_path = self.output_path_var.get().strip()
        if not output_path:
            output_path = self._suggest_output_path(input_path)
            self.output_path_var.set(output_path)

        config = self._build_config()

        def work():
            report = self.engine.generate_schedule(
                input_path,
                output_path,
                config,
                progress_callback=self._on_progress,
            )
            return {"kind": "generate", "report": report}

        self._run_background(work, generate_mode=True)

    def _copy_report(self) -> None:
        content = self.output_text.get("1.0", "end").strip()
        if not content:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(content)
        messagebox.showinfo("Copied", "Report copied to clipboard.")


def main() -> None:
    root = tk.Tk()
    app = SchedulerApp(root)
    app._append_report(
        "Ready",
        "Select an input Excel, review config, then click Analyze Input or Generate + Save.",
    )
    root.mainloop()


if __name__ == "__main__":
    main()
