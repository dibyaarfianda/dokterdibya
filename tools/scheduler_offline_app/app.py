from __future__ import annotations

import csv
import json
import queue
import threading
import traceback
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Dict, List

try:
    from scheduler_engine import OfflineSchedulerEngine, SchedulerConfig
except ModuleNotFoundError:
    from .scheduler_engine import OfflineSchedulerEngine, SchedulerConfig


TRANSLATIONS: Dict[str, Dict[str, str]] = {
    "id": {
        "app_title": "Generator Jadwal Jaga RSIA MELINDA",
        "frame_files": "Berkas",
        "frame_config": "Konfigurasi",
        "frame_rules": "Aturan",
        "welcome_title": "Generator Jadwal Jaga RSIA MELINDA",
        "welcome_subtitle": "Pilih jenis jadwal yang ingin dibuat",
        "welcome_option_vk": "Jadwal Jaga VK / Ruangan",
        "welcome_option_neonatus": "Jadwal Jaga Neonatus",
        "welcome_neonatus_coming_soon": "Neonatus: Coming Soon",
        "welcome_mode_selected_vk": "Mode aktif: Jadwal Jaga VK / Ruangan",
        "welcome_mode_selected_neonatus": "Mode Neonatus belum tersedia (coming soon).",
        "label_input_excel": "Excel Input",
        "label_output_excel": "Excel Output",
        "label_report_folder": "Folder Laporan",
        "label_language": "Bahasa",
        "btn_browse": "Pilih",
        "cb_auto_export_json": "Ekspor Otomatis JSON",
        "cb_auto_export_csv": "Ekspor Otomatis CSV",
        "btn_apply_preset": "Terapkan Preset: Final VK",
        "btn_analyze": "Analisa Input",
        "btn_generate": "Generate + Simpan",
        "btn_copy": "Salin Laporan",
        "field_sheet": "Sheet",
        "field_start_day": "Hari Mulai",
        "field_end_day": "Hari Akhir",
        "field_iterations": "Iterasi",
        "field_seed": "Seed",
        "field_temp": "Suhu",
        "field_top_rank_count": "Jumlah Rank Atas",
        "field_top_rank_max_night": "Malam Maks Rank Atas",
        "field_max_core_rank": "Max Core Rank",
        "field_off_targets": "Target Libur (CSV)",
        "field_uniform_group": "Rank Grup Seragam (CSV)",
        "rule_no_m_to_p": "Tanpa M -> P",
        "rule_each_mll": "Semua Staff Punya M-L-L",
        "rule_group_not_together": "Rank Grup Tidak Bersamaan",
        "rule_tandem": "Tandem Wajib",
        "rule_top_night_cap": "Batas Malam Rank Atas",
        "rule_uniform_off": "Libur Grup Seragam",
        "rule_uniform_night": "Malam Grup Seragam",
        "rule_night_monotonic": "Malam Monotonik",
        "rule_off_monotonic": "Libur Monotonik",
        "rule_apply_colors": "Terapkan Warna",
        "progress_idle": "Siap",
        "progress_starting": "Memulai optimasi...",
        "progress_preparing": "Menyiapkan workbook dan jadwal awal...",
        "progress_working": "Sedang memproses...",
        "progress_percent_fmt": "{percent}% | {text}",
        "progress_optimizing_fmt": "Optimasi {iteration}/{total} | berjalan {elapsed} | sisa {eta}",
        "progress_saving_fmt": "Menyimpan output | berjalan {elapsed}",
        "progress_done_fmt": "Selesai | berjalan {elapsed}",
        "progress_error": "Error",
        "progress_generate_complete": "Generate selesai",
        "preset_applied_status": "Preset Final VK diterapkan",
        "report_title_preset": "Preset",
        "preset_report_message": "Preset Final VK sudah diterapkan.",
        "report_title_result": "Hasil",
        "report_title_error": "Error",
        "report_title_export": "Ekspor",
        "report_title_notice": "Info",
        "report_title_ready": "Siap",
        "report_title_language": "Bahasa",
        "report_language_changed": "Bahasa aplikasi diubah ke {language}.",
        "report_title_mode": "Mode",
        "save_fallback_notice_fmt": "Output utama tidak bisa ditulis.\nPermintaan awal: {requested}\nDisimpan otomatis ke: {actual}",
        "save_fallback_warning_title": "Output Dialihkan",
        "permission_error_hint": "Tidak bisa menulis file output. Pastikan file tidak sedang dibuka di Excel, lalu pilih nama atau folder output lain.",
        "ready_message": "Pilih file input Excel, cek konfigurasi, lalu klik Analisa Input atau Generate + Simpan.",
        "dialog_select_input": "Pilih file jadwal input",
        "dialog_save_output": "Simpan file jadwal output",
        "dialog_select_report_folder": "Pilih folder ekspor laporan",
        "warn_input_required_title": "Input dibutuhkan",
        "warn_input_required_msg": "Silakan pilih file Excel input terlebih dahulu.",
        "info_copied_title": "Tersalin",
        "info_copied_msg": "Laporan berhasil disalin ke clipboard.",
        "error_title": "Error",
        "info_title": "Info",
    },
    "en": {
        "app_title": "Generator Jadwal Jaga RSIA MELINDA",
        "frame_files": "Files",
        "frame_config": "Config",
        "frame_rules": "Rules",
        "welcome_title": "Generator Jadwal Jaga RSIA MELINDA",
        "welcome_subtitle": "Choose the schedule type to generate",
        "welcome_option_vk": "VK / Ward Duty Schedule",
        "welcome_option_neonatus": "Neonatus Duty Schedule",
        "welcome_neonatus_coming_soon": "Neonatus: Coming Soon",
        "welcome_mode_selected_vk": "Active mode: VK / Ward Duty Schedule",
        "welcome_mode_selected_neonatus": "Neonatus mode is not available yet (coming soon).",
        "label_input_excel": "Input Excel",
        "label_output_excel": "Output Excel",
        "label_report_folder": "Report Folder",
        "label_language": "Language",
        "btn_browse": "Browse",
        "cb_auto_export_json": "Auto Export JSON",
        "cb_auto_export_csv": "Auto Export CSV",
        "btn_apply_preset": "Apply Preset: Final VK",
        "btn_analyze": "Analyze Input",
        "btn_generate": "Generate + Save",
        "btn_copy": "Copy Report",
        "field_sheet": "Sheet",
        "field_start_day": "Start Day",
        "field_end_day": "End Day",
        "field_iterations": "Iterations",
        "field_seed": "Seed",
        "field_temp": "Temp",
        "field_top_rank_count": "Top Rank Count",
        "field_top_rank_max_night": "Top Rank Max Night",
        "field_max_core_rank": "Max Core Rank",
        "field_off_targets": "Off Targets (CSV)",
        "field_uniform_group": "Uniform Group Ranks (CSV)",
        "rule_no_m_to_p": "No M->P",
        "rule_each_mll": "Each Staff Has M-L-L",
        "rule_group_not_together": "Rank Group Not Together",
        "rule_tandem": "Tandem Required",
        "rule_top_night_cap": "Top Rank Night Cap",
        "rule_uniform_off": "Uniform Group Off",
        "rule_uniform_night": "Uniform Group Night",
        "rule_night_monotonic": "Night Monotonic",
        "rule_off_monotonic": "Off Monotonic",
        "rule_apply_colors": "Apply Colors",
        "progress_idle": "Idle",
        "progress_starting": "Starting optimization...",
        "progress_preparing": "Preparing workbook and initial schedule...",
        "progress_working": "Working...",
        "progress_percent_fmt": "{percent}% | {text}",
        "progress_optimizing_fmt": "Optimizing {iteration}/{total} | elapsed {elapsed} | eta {eta}",
        "progress_saving_fmt": "Saving output | elapsed {elapsed}",
        "progress_done_fmt": "Done | elapsed {elapsed}",
        "progress_error": "Error",
        "progress_generate_complete": "Generate complete",
        "preset_applied_status": "Final VK preset applied",
        "report_title_preset": "Preset",
        "preset_report_message": "Final VK preset has been applied.",
        "report_title_result": "Result",
        "report_title_error": "Error",
        "report_title_export": "Export",
        "report_title_notice": "Notice",
        "report_title_ready": "Ready",
        "report_title_language": "Language",
        "report_language_changed": "Application language switched to {language}.",
        "report_title_mode": "Mode",
        "save_fallback_notice_fmt": "Primary output path could not be written.\nRequested: {requested}\nSaved automatically to: {actual}",
        "save_fallback_warning_title": "Output Redirected",
        "permission_error_hint": "Cannot write output file. Make sure it is not open in Excel, then choose another output name or folder.",
        "ready_message": "Select an input Excel, review config, then click Analyze Input or Generate + Save.",
        "dialog_select_input": "Select input schedule file",
        "dialog_save_output": "Save output schedule as",
        "dialog_select_report_folder": "Select report export folder",
        "warn_input_required_title": "Input required",
        "warn_input_required_msg": "Please choose an input Excel file first.",
        "info_copied_title": "Copied",
        "info_copied_msg": "Report copied to clipboard.",
        "error_title": "Error",
        "info_title": "Info",
    },
}


LANGUAGE_NAME_TO_CODE: Dict[str, str] = {
    "Indonesia": "id",
    "English": "en",
}

LANGUAGE_CODE_TO_NAME: Dict[str, str] = {code: name for name, code in LANGUAGE_NAME_TO_CODE.items()}


class SchedulerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.geometry("1150x760")

        self.engine = OfflineSchedulerEngine()

        self._build_vars()
        self._build_ui()
        self._apply_language(refresh_progress=True)
        self._show_welcome_screen()
        self.root.after(120, self._drain_progress_queue)

    def _build_vars(self) -> None:
        self.language_code_var = tk.StringVar(value="id")
        self.language_name_var = tk.StringVar(value=LANGUAGE_CODE_TO_NAME["id"])
        self.schedule_mode_var = tk.StringVar(value="")

        self.input_path_var = tk.StringVar()
        self.output_path_var = tk.StringVar()
        self.export_folder_var = tk.StringVar()

        self.sheet_name_var = tk.StringVar(value="JADWAL BARU")
        self.start_day_var = tk.StringVar(value="1")
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
        self.progress_text_var = tk.StringVar(value="")
        self._is_generating = False
        self._progress_queue: queue.Queue = queue.Queue()

        self.config_label_widgets: Dict[str, ttk.Label] = {}
        self.rule_check_widgets: Dict[str, ttk.Checkbutton] = {}

    def _build_ui(self) -> None:
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        self.main_container = ttk.Frame(self.root)
        self.main_container.grid(row=0, column=0, sticky="nsew")
        self.main_container.columnconfigure(0, weight=1)
        self.main_container.rowconfigure(3, weight=1)

        self.path_frame = ttk.LabelFrame(self.main_container)
        self.path_frame.grid(row=0, column=0, sticky="ew", padx=10, pady=8)
        self.path_frame.columnconfigure(1, weight=1)

        self.label_input_excel = ttk.Label(self.path_frame)
        self.label_input_excel.grid(row=0, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(self.path_frame, textvariable=self.input_path_var).grid(
            row=0, column=1, sticky="ew", padx=6, pady=4
        )
        self.btn_browse_input = ttk.Button(self.path_frame, command=self._browse_input)
        self.btn_browse_input.grid(
            row=0, column=2, padx=6, pady=4
        )

        self.label_output_excel = ttk.Label(self.path_frame)
        self.label_output_excel.grid(row=1, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(self.path_frame, textvariable=self.output_path_var).grid(
            row=1, column=1, sticky="ew", padx=6, pady=4
        )
        self.btn_browse_output = ttk.Button(self.path_frame, command=self._browse_output)
        self.btn_browse_output.grid(
            row=1, column=2, padx=6, pady=4
        )

        self.label_report_folder = ttk.Label(self.path_frame)
        self.label_report_folder.grid(row=2, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(self.path_frame, textvariable=self.export_folder_var).grid(
            row=2, column=1, sticky="ew", padx=6, pady=4
        )
        self.btn_browse_report_folder = ttk.Button(self.path_frame, command=self._browse_export_folder)
        self.btn_browse_report_folder.grid(
            row=2, column=2, padx=6, pady=4
        )

        self.cb_export_json = ttk.Checkbutton(self.path_frame, variable=self.export_json_var)
        self.cb_export_json.grid(
            row=3, column=1, sticky="w", padx=6, pady=4
        )
        self.cb_export_csv = ttk.Checkbutton(self.path_frame, variable=self.export_csv_var)
        self.cb_export_csv.grid(
            row=3, column=1, sticky="e", padx=6, pady=4
        )

        self.label_language = ttk.Label(self.path_frame)
        self.label_language.grid(row=4, column=0, sticky="w", padx=6, pady=4)
        self.language_combo = ttk.Combobox(
            self.path_frame,
            state="readonly",
            textvariable=self.language_name_var,
            values=list(LANGUAGE_NAME_TO_CODE.keys()),
            width=14,
        )
        self.language_combo.grid(row=4, column=1, sticky="w", padx=6, pady=4)
        self.language_combo.bind("<<ComboboxSelected>>", self._on_language_selected)

        self.config_frame = ttk.LabelFrame(self.main_container)
        self.config_frame.grid(row=1, column=0, sticky="ew", padx=10, pady=6)

        self.config_label_widgets["field_sheet"] = self._add_labeled_entry(
            self.config_frame, "", self.sheet_name_var, 0, 0
        )
        self.config_label_widgets["field_start_day"] = self._add_labeled_entry(
            self.config_frame, "", self.start_day_var, 0, 2
        )
        self.config_label_widgets["field_end_day"] = self._add_labeled_entry(
            self.config_frame, "", self.end_day_var, 0, 4
        )

        self._add_labeled_entry(self.config_frame, "P", self.p_count_var, 1, 0)
        self._add_labeled_entry(self.config_frame, "S", self.s_count_var, 1, 2)
        self._add_labeled_entry(self.config_frame, "M", self.m_count_var, 1, 4)

        self.config_label_widgets["field_iterations"] = self._add_labeled_entry(
            self.config_frame, "", self.iterations_var, 2, 0
        )
        self.config_label_widgets["field_seed"] = self._add_labeled_entry(
            self.config_frame, "", self.seed_var, 2, 2
        )
        self.config_label_widgets["field_temp"] = self._add_labeled_entry(
            self.config_frame, "", self.temperature_var, 2, 4
        )

        self.config_label_widgets["field_top_rank_count"] = self._add_labeled_entry(
            self.config_frame, "", self.top_rank_count_var, 3, 0
        )
        self.config_label_widgets["field_top_rank_max_night"] = self._add_labeled_entry(
            self.config_frame, "", self.top_rank_max_night_var, 3, 2
        )
        self.config_label_widgets["field_max_core_rank"] = self._add_labeled_entry(
            self.config_frame, "", self.max_core_rank_var, 3, 4
        )

        self.config_label_widgets["field_off_targets"] = self._add_labeled_entry(
            self.config_frame, "", self.off_targets_var, 4, 0, span=5
        )
        self.config_label_widgets["field_uniform_group"] = self._add_labeled_entry(
            self.config_frame, "", self.uniform_group_var, 5, 0, span=5
        )

        self.flags_frame = ttk.LabelFrame(self.main_container)
        self.flags_frame.grid(row=2, column=0, sticky="ew", padx=10, pady=6)

        flags = [
            ("rule_no_m_to_p", self.enforce_no_m_to_p_var),
            ("rule_each_mll", self.enforce_mll_each_var),
            ("rule_group_not_together", self.enforce_rank_group_not_together_var),
            ("rule_tandem", self.enforce_tandem_var),
            ("rule_top_night_cap", self.enforce_top_rank_night_cap_var),
            ("rule_uniform_off", self.enforce_uniform_group_off_var),
            ("rule_uniform_night", self.enforce_uniform_group_night_var),
            ("rule_night_monotonic", self.enforce_night_monotonic_var),
            ("rule_off_monotonic", self.enforce_off_monotonic_var),
            ("rule_apply_colors", self.assign_colors_var),
        ]

        for idx, (label_key, var) in enumerate(flags):
            r = idx // 5
            c = idx % 5
            cb = ttk.Checkbutton(self.flags_frame, variable=var)
            cb.grid(
                row=r, column=c, sticky="w", padx=10, pady=4
            )
            self.rule_check_widgets[label_key] = cb

        action_frame = ttk.Frame(self.main_container)
        action_frame.grid(row=3, column=0, sticky="nsew", padx=10, pady=8)
        action_frame.columnconfigure(0, weight=1)
        action_frame.rowconfigure(1, weight=1)

        button_bar = ttk.Frame(action_frame)
        button_bar.grid(row=0, column=0, sticky="ew")

        self.preset_btn = ttk.Button(
            button_bar,
            command=self._apply_preset_final_vk,
        )
        self.preset_btn.pack(side="left", padx=4)

        self.analyze_btn = ttk.Button(button_bar, command=self._on_analyze)
        self.analyze_btn.pack(side="left", padx=4)

        self.generate_btn = ttk.Button(button_bar, command=self._on_generate)
        self.generate_btn.pack(side="left", padx=4)

        self.copy_btn = ttk.Button(button_bar, command=self._copy_report)
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

        self.progress_label = ttk.Label(progress_frame, textvariable=self.progress_text_var, width=56, anchor="w")
        self.progress_label.grid(
            row=0, column=1, sticky="w"
        )

        self.output_text = tk.Text(action_frame, wrap="word")
        self.output_text.grid(row=2, column=0, sticky="nsew", pady=6)
        scroll = ttk.Scrollbar(action_frame, command=self.output_text.yview)
        scroll.grid(row=2, column=1, sticky="ns")
        self.output_text.configure(yscrollcommand=scroll.set)
        action_frame.rowconfigure(2, weight=1)

        self.welcome_frame = ttk.Frame(self.root, padding=24)
        self.welcome_frame.grid(row=0, column=0, sticky="nsew")
        self.welcome_frame.columnconfigure(0, weight=1)
        self.welcome_frame.rowconfigure(4, weight=1)

        self.welcome_title_label = ttk.Label(self.welcome_frame, font=("Segoe UI", 20, "bold"))
        self.welcome_title_label.grid(row=0, column=0, sticky="n", pady=(8, 10))

        self.welcome_subtitle_label = ttk.Label(self.welcome_frame, font=("Segoe UI", 11))
        self.welcome_subtitle_label.grid(row=1, column=0, sticky="n", pady=(0, 24))

        self.welcome_vk_btn = ttk.Button(
            self.welcome_frame,
            width=36,
            command=self._select_mode_vk,
        )
        self.welcome_vk_btn.grid(row=2, column=0, pady=8)

        self.welcome_neonatus_btn = ttk.Button(
            self.welcome_frame,
            width=36,
            command=self._select_mode_neonatus,
        )
        self.welcome_neonatus_btn.grid(row=3, column=0, pady=8)

    def _add_labeled_entry(
        self,
        parent: ttk.Widget,
        label: str,
        var: tk.StringVar,
        row: int,
        col: int,
        span: int = 1,
    ) -> ttk.Label:
        label_widget = ttk.Label(parent, text=label)
        label_widget.grid(row=row, column=col, sticky="w", padx=6, pady=4)
        entry = ttk.Entry(parent, textvariable=var)
        entry.grid(row=row, column=col + 1, sticky="ew", padx=6, pady=4, columnspan=span)
        parent.columnconfigure(col + 1, weight=1)
        return label_widget

    def _language_code(self) -> str:
        code = self.language_code_var.get().strip().lower()
        return code if code in TRANSLATIONS else "id"

    def _tr(self, key: str, **kwargs: object) -> str:
        code = self._language_code()
        text = TRANSLATIONS.get(code, TRANSLATIONS["id"]).get(key)
        if text is None:
            text = TRANSLATIONS["en"].get(key, key)
        if kwargs:
            try:
                text = text.format(**kwargs)
            except Exception:
                pass
        return text

    def _apply_language(self, refresh_progress: bool = False) -> None:
        self.root.title(self._tr("app_title"))

        self.welcome_title_label.configure(text=self._tr("welcome_title"))
        self.welcome_subtitle_label.configure(text=self._tr("welcome_subtitle"))
        self.welcome_vk_btn.configure(text=self._tr("welcome_option_vk"))
        self.welcome_neonatus_btn.configure(text=self._tr("welcome_option_neonatus"))

        self.path_frame.configure(text=self._tr("frame_files"))
        self.config_frame.configure(text=self._tr("frame_config"))
        self.flags_frame.configure(text=self._tr("frame_rules"))

        self.label_input_excel.configure(text=self._tr("label_input_excel"))
        self.label_output_excel.configure(text=self._tr("label_output_excel"))
        self.label_report_folder.configure(text=self._tr("label_report_folder"))
        self.label_language.configure(text=self._tr("label_language"))

        browse_text = self._tr("btn_browse")
        self.btn_browse_input.configure(text=browse_text)
        self.btn_browse_output.configure(text=browse_text)
        self.btn_browse_report_folder.configure(text=browse_text)

        self.cb_export_json.configure(text=self._tr("cb_auto_export_json"))
        self.cb_export_csv.configure(text=self._tr("cb_auto_export_csv"))

        for key, label_widget in self.config_label_widgets.items():
            label_widget.configure(text=self._tr(key))

        for key, check_widget in self.rule_check_widgets.items():
            check_widget.configure(text=self._tr(key))

        self.preset_btn.configure(text=self._tr("btn_apply_preset"))
        self.analyze_btn.configure(text=self._tr("btn_analyze"))
        self.generate_btn.configure(text=self._tr("btn_generate"))
        self.copy_btn.configure(text=self._tr("btn_copy"))

        if refresh_progress and not self._is_generating:
            if self.progress_var.get() >= 100:
                self.progress_text_var.set(
                    self._tr(
                        "progress_percent_fmt",
                        percent=100,
                        text=self._tr("progress_generate_complete"),
                    )
                )
            elif self.progress_var.get() <= 0:
                self.progress_text_var.set(
                    self._tr(
                        "progress_percent_fmt",
                        percent=0,
                        text=self._tr("progress_idle"),
                    )
                )

    def _show_welcome_screen(self) -> None:
        self.main_container.grid_remove()
        self.welcome_frame.grid()

    def _show_main_screen(self) -> None:
        self.welcome_frame.grid_remove()
        self.main_container.grid()

    def _select_mode_vk(self) -> None:
        self.schedule_mode_var.set("vk_ruangan")
        self._show_main_screen()
        self._append_report(self._tr("report_title_mode"), self._tr("welcome_mode_selected_vk"))

    def _select_mode_neonatus(self) -> None:
        self.schedule_mode_var.set("neonatus")
        msg = self._tr("welcome_mode_selected_neonatus")
        self._append_report(self._tr("report_title_mode"), msg)
        messagebox.showinfo(self._tr("info_title"), self._tr("welcome_neonatus_coming_soon"))

    def _on_language_selected(self, _event=None) -> None:
        selected = self.language_name_var.get().strip()
        code = LANGUAGE_NAME_TO_CODE.get(selected, "id")
        self.language_code_var.set(code)
        self._apply_language(refresh_progress=True)
        self._append_report(
            self._tr("report_title_language"),
            self._tr("report_language_changed", language=selected),
        )

    def _browse_input(self) -> None:
        p = filedialog.askopenfilename(
            title=self._tr("dialog_select_input"),
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
            title=self._tr("dialog_save_output"),
            defaultextension=".xlsx",
            filetypes=[("Excel files", "*.xlsx")],
        )
        if p:
            self.output_path_var.set(p)

    def _browse_export_folder(self) -> None:
        p = filedialog.askdirectory(title=self._tr("dialog_select_report_folder"))
        if p:
            self.export_folder_var.set(p)

    def _suggest_output_path(self, input_path: str) -> str:
        path = Path(input_path)
        return str(path.with_name(path.stem + " - generated.xlsx"))

    def _build_save_fallback_paths(self, output_path: str, input_path: str) -> List[str]:
        requested = Path(output_path)
        input_file = Path(input_path)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        suffix = requested.suffix if requested.suffix else ".xlsx"
        stem = requested.stem if requested.stem else "jadwal-generated"

        same_dir_fallback = requested.with_name(f"{stem} - autosave-{stamp}{suffix}")

        candidates = [same_dir_fallback]
        input_dir = input_file.parent
        if input_dir != requested.parent:
            candidates.append(input_dir / f"{stem} - autosave-{stamp}{suffix}")

        desktop_dir = Path.home() / "Desktop"
        if desktop_dir.exists() and desktop_dir != requested.parent and desktop_dir != input_dir:
            candidates.append(desktop_dir / f"{stem} - autosave-{stamp}{suffix}")

        out: List[str] = []
        seen = {str(requested)}
        for cand in candidates:
            s = str(cand)
            if s in seen:
                continue
            seen.add(s)
            out.append(s)
        return out

    def _set_busy(self, busy: bool) -> None:
        state = "disabled" if busy else "normal"
        self.language_combo.configure(state="disabled" if busy else "readonly")
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
        self.start_day_var.set("1")
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
        self.progress_text_var.set(self._tr("preset_applied_status"))
        self._append_report(self._tr("report_title_preset"), self._tr("preset_report_message"))

    def _run_background(self, worker, generate_mode: bool = False) -> None:
        self._set_busy(True)
        self._is_generating = generate_mode
        if generate_mode:
            self._clear_progress_queue()
            self.progress_var.set(0.0)
            self.progress_text_var.set(
                self._tr(
                    "progress_percent_fmt",
                    percent=0,
                    text=self._tr("progress_starting"),
                )
            )

        def runner() -> None:
            try:
                result = worker()
                self.root.after(0, lambda: self._on_worker_success(result))
            except Exception as exc:
                msg = f"{exc}\n\n{traceback.format_exc()}"
                self.root.after(0, lambda: self._on_worker_error(msg))

        threading.Thread(target=runner, daemon=True).start()

    def _on_worker_success(self, result: object) -> None:
        self._drain_progress_queue_once()
        self._set_busy(False)
        self._is_generating = False

        if isinstance(result, dict) and "kind" in result and "report" in result:
            report = result["report"]
            report_text = OfflineSchedulerEngine.report_to_pretty_json(report)
            self._append_report(self._tr("report_title_result"), report_text)

            if result["kind"] == "generate":
                requested_output = str(report.get("_requested_output_file") or "")
                actual_output = str(report.get("output_file") or requested_output)
                if report.get("_save_fallback_used"):
                    notice = self._tr(
                        "save_fallback_notice_fmt",
                        requested=requested_output,
                        actual=actual_output,
                    )
                    self.output_path_var.set(actual_output)
                    self._append_report(self._tr("report_title_notice"), notice)
                    messagebox.showwarning(self._tr("save_fallback_warning_title"), notice)

                self._auto_export_report(report)
                self.progress_var.set(100.0)
                self.progress_text_var.set(
                    self._tr(
                        "progress_percent_fmt",
                        percent=100,
                        text=self._tr("progress_generate_complete"),
                    )
                )
            return

        self._append_report(self._tr("report_title_result"), result)

    def _on_worker_error(self, err: str) -> None:
        self._drain_progress_queue_once()
        self._set_busy(False)
        self._is_generating = False
        self.progress_text_var.set(
            self._tr(
                "progress_percent_fmt",
                percent=int(self.progress_var.get()),
                text=self._tr("progress_error"),
            )
        )
        if "Permission denied" in err or "Failed to save workbook" in err:
            err = f"{err}\n\n{self._tr('permission_error_hint')}"
        self._append_report(self._tr("report_title_error"), err)
        messagebox.showerror(self._tr("error_title"), err)

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
        try:
            self._progress_queue.put_nowait(dict(payload or {}))
        except Exception:
            pass

    def _clear_progress_queue(self) -> None:
        while True:
            try:
                self._progress_queue.get_nowait()
            except queue.Empty:
                break

    def _drain_progress_queue_once(self) -> None:
        while True:
            try:
                payload = self._progress_queue.get_nowait()
            except queue.Empty:
                break
            self._apply_progress_payload(payload)

    def _drain_progress_queue(self) -> None:
        self._drain_progress_queue_once()
        self.root.after(120, self._drain_progress_queue)

    def _apply_progress_payload(self, payload: dict) -> None:
        progress = max(0.0, min(1.0, float(payload.get("progress", 0.0))))
        self.progress_var.set(progress * 100.0)
        percent = int(round(progress * 100.0))

        phase = str(payload.get("phase", "optimize"))
        iteration = payload.get("iteration")
        total_iterations = payload.get("total_iterations")
        elapsed = self._format_seconds(payload.get("elapsed_sec"))
        eta = self._format_seconds(payload.get("eta_sec"))

        if phase == "optimize" and iteration is not None and total_iterations is not None:
            text = self._tr(
                "progress_optimizing_fmt",
                iteration=iteration,
                total=total_iterations,
                elapsed=elapsed,
                eta=eta,
            )
        elif phase == "prepare":
            text = self._tr("progress_preparing")
        elif phase == "save":
            text = self._tr("progress_saving_fmt", elapsed=elapsed)
        elif phase == "done":
            text = self._tr("progress_done_fmt", elapsed=elapsed)
        else:
            text = str(payload.get("message", self._tr("progress_working")))

        self.progress_text_var.set(
            self._tr("progress_percent_fmt", percent=percent, text=text)
        )

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
            self._append_report(self._tr("report_title_export"), "\n".join(exported))

    def _on_analyze(self) -> None:
        input_path = self.input_path_var.get().strip()
        if not input_path:
            messagebox.showwarning(
                self._tr("warn_input_required_title"),
                self._tr("warn_input_required_msg"),
            )
            return

        config = self._build_config()

        def work():
            report = self.engine.analyze_workbook(input_path, config)
            return {"kind": "analyze", "report": report}

        self._run_background(work, generate_mode=False)

    def _on_generate(self) -> None:
        input_path = self.input_path_var.get().strip()
        if not input_path:
            messagebox.showwarning(
                self._tr("warn_input_required_title"),
                self._tr("warn_input_required_msg"),
            )
            return

        output_path = self.output_path_var.get().strip()
        if not output_path:
            output_path = self._suggest_output_path(input_path)
            self.output_path_var.set(output_path)

        config = self._build_config()

        def work():
            fallback_paths = self._build_save_fallback_paths(output_path, input_path)
            report = self.engine.generate_schedule(
                input_path,
                output_path,
                config,
                progress_callback=self._on_progress,
                save_fallback_paths=fallback_paths,
            )
            return {"kind": "generate", "report": report}

        self._run_background(work, generate_mode=True)

    def _copy_report(self) -> None:
        content = self.output_text.get("1.0", "end").strip()
        if not content:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(content)
        messagebox.showinfo(self._tr("info_copied_title"), self._tr("info_copied_msg"))


def main() -> None:
    root = tk.Tk()
    app = SchedulerApp(root)
    app._append_report(
        app._tr("report_title_ready"),
        app._tr("ready_message"),
    )
    root.mainloop()


if __name__ == "__main__":
    main()
