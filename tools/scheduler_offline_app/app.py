from __future__ import annotations

import csv
import json
import os
import queue
import sys
import threading
import traceback
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Any, Dict, List

try:
    from scheduler_engine import OfflineSchedulerEngine, SchedulerConfig
except ModuleNotFoundError:
    from .scheduler_engine import OfflineSchedulerEngine, SchedulerConfig


TRANSLATIONS: Dict[str, Dict[str, str]] = {
    "id": {
        "app_title": "Generator Jadwal Jaga RSIA MELINDA",
        "header_subtitle": "Tema visual Staff Panel dokterDIBYA",
        "header_badge": "STAFF PANEL STYLE",
        "footer_developed_by": "Developed by dokterDIBYA",
        "status_badge_idle": "SIAP",
        "status_badge_preparing": "MENYIAPKAN",
        "status_badge_optimizing": "OPTIMASI",
        "status_badge_saving": "MENYIMPAN",
        "status_badge_done": "SELESAI",
        "status_badge_error": "ERROR",
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
        "btn_save_config": "Simpan Konfigurasi",
        "btn_load_config": "Muat Konfigurasi",
        "btn_reset_config": "Reset Default",
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
        "report_title_config": "Konfigurasi",
        "save_fallback_notice_fmt": "Output utama tidak bisa ditulis.\nPermintaan awal: {requested}\nDisimpan otomatis ke: {actual}",
        "save_fallback_warning_title": "Output Dialihkan",
        "permission_error_hint": "Tidak bisa menulis file output. Pastikan file tidak sedang dibuka di Excel, lalu pilih nama atau folder output lain.",
        "dialog_save_config": "Simpan konfigurasi sebagai",
        "dialog_load_config": "Pilih file konfigurasi",
        "config_saved_msg_fmt": "Konfigurasi disimpan ke:\n{path}",
        "config_loaded_msg_fmt": "Konfigurasi dimuat dari:\n{path}",
        "config_reset_msg": "Konfigurasi direset ke default.",
        "config_invalid_format": "File konfigurasi tidak valid.",
        "config_apply_failed": "Gagal menerapkan konfigurasi.",
        "config_autoload_report_fmt": "Konfigurasi terakhir dimuat otomatis dari:\n{path}",
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
        "header_subtitle": "Staff Panel visual theme by dokterDIBYA",
        "header_badge": "STAFF PANEL STYLE",
        "footer_developed_by": "Developed by dokterDIBYA",
        "status_badge_idle": "IDLE",
        "status_badge_preparing": "PREPARING",
        "status_badge_optimizing": "OPTIMIZING",
        "status_badge_saving": "SAVING",
        "status_badge_done": "DONE",
        "status_badge_error": "ERROR",
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
        "btn_save_config": "Save Config",
        "btn_load_config": "Load Config",
        "btn_reset_config": "Reset Defaults",
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
        "report_title_config": "Config",
        "save_fallback_notice_fmt": "Primary output path could not be written.\nRequested: {requested}\nSaved automatically to: {actual}",
        "save_fallback_warning_title": "Output Redirected",
        "permission_error_hint": "Cannot write output file. Make sure it is not open in Excel, then choose another output name or folder.",
        "dialog_save_config": "Save configuration as",
        "dialog_load_config": "Select configuration file",
        "config_saved_msg_fmt": "Configuration saved to:\n{path}",
        "config_loaded_msg_fmt": "Configuration loaded from:\n{path}",
        "config_reset_msg": "Configuration reset to defaults.",
        "config_invalid_format": "Configuration file format is invalid.",
        "config_apply_failed": "Failed to apply configuration.",
        "config_autoload_report_fmt": "Last configuration auto-loaded from:\n{path}",
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

CONFIG_SCHEMA_VERSION = 1
CONFIG_DIR_NAME = "RSIA-MELINDA-Scheduler"
LAST_CONFIG_FILE_NAME = "last-config.json"


class SchedulerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.geometry("1220x820")
        self.root.minsize(1060, 700)
        self._last_config_path = self._get_last_config_path()
        self._suspend_auto_persist = False

        self.engine = OfflineSchedulerEngine()

        self._configure_styles()
        self._build_vars()
        self._load_brand_logo()
        self._build_ui()
        self._apply_language(refresh_progress=True)
        self._show_welcome_screen()
        self._load_last_config_silent()
        self.root.protocol("WM_DELETE_WINDOW", self._on_app_close)
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
        self._progress_target = 0.0
        self._progress_anim_job: str | None = None

        self._status_badge_key = "idle"
        self._status_badge_color = "#6c757d"
        self._status_badge_pulse = False
        self._status_badge_pulse_job: str | None = None
        self._status_badge_pulse_on = False

        self._logo_source_path: str = ""
        self.logo_image_topbar: tk.PhotoImage | None = None
        self.logo_image_welcome: tk.PhotoImage | None = None
        self.logo_image_icon: tk.PhotoImage | None = None
        self.logo_image_raw: tk.PhotoImage | None = None

        self.config_label_widgets: Dict[str, ttk.Label] = {}
        self.rule_check_widgets: Dict[str, ttk.Checkbutton] = {}

    def _configure_styles(self) -> None:
        self.root.configure(bg="#f4f6f9")

        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        self.style = style

        style.configure("App.TFrame", background="#f4f6f9")
        style.configure("WelcomeCard.TFrame", background="#ffffff")

        style.configure(
            "Card.TLabelframe",
            background="#ffffff",
            borderwidth=1,
            relief="solid",
            padding=4,
        )
        style.configure(
            "Card.TLabelframe.Label",
            background="#ffffff",
            foreground="#2f3b52",
            font=("Segoe UI", 10, "bold"),
        )

        style.configure(
            "App.TLabel",
            background="#f4f6f9",
            foreground="#2f3b52",
            font=("Segoe UI", 9),
        )
        style.configure(
            "Card.TLabel",
            background="#ffffff",
            foreground="#2f3b52",
            font=("Segoe UI", 9),
        )
        style.configure(
            "Muted.TLabel",
            background="#f4f6f9",
            foreground="#6c757d",
            font=("Segoe UI", 9),
        )
        style.configure(
            "WelcomeTitle.TLabel",
            background="#ffffff",
            foreground="#2f3b52",
            font=("Segoe UI", 22, "bold"),
        )
        style.configure(
            "WelcomeSubtitle.TLabel",
            background="#ffffff",
            foreground="#6c757d",
            font=("Segoe UI", 11),
        )
        style.configure(
            "Footer.TLabel",
            background="#f4f6f9",
            foreground="#6c757d",
            font=("Segoe UI", 9, "italic"),
        )

        style.configure("App.TEntry", padding=(8, 6))
        style.configure("App.TCombobox", padding=(7, 5))

        style.configure(
            "Card.TCheckbutton",
            background="#ffffff",
            foreground="#2f3b52",
            font=("Segoe UI", 9),
        )
        style.map(
            "Card.TCheckbutton",
            background=[("active", "#ffffff"), ("selected", "#ffffff")],
        )

        style.configure(
            "Primary.TButton",
            padding=(12, 8),
            background="#0d6efd",
            foreground="#ffffff",
            borderwidth=0,
            relief="flat",
            font=("Segoe UI", 9, "bold"),
        )
        style.map(
            "Primary.TButton",
            background=[
                ("active", "#0b5ed7"),
                ("pressed", "#0a58ca"),
                ("disabled", "#a9c6fa"),
            ],
            foreground=[("disabled", "#eef4ff")],
        )

        style.configure(
            "Outline.TButton",
            padding=(12, 8),
            background="#ffffff",
            foreground="#0d6efd",
            borderwidth=1,
            relief="solid",
            font=("Segoe UI", 9, "bold"),
        )
        style.map(
            "Outline.TButton",
            background=[
                ("active", "#eef5ff"),
                ("pressed", "#dbeafe"),
                ("disabled", "#f1f3f5"),
            ],
            foreground=[("disabled", "#9db7ef")],
        )

        style.configure(
            "PrimaryLarge.TButton",
            padding=(18, 12),
            background="#0d6efd",
            foreground="#ffffff",
            borderwidth=0,
            relief="flat",
            font=("Segoe UI", 10, "bold"),
        )
        style.map(
            "PrimaryLarge.TButton",
            background=[("active", "#0b5ed7"), ("pressed", "#0a58ca")],
        )

        style.configure(
            "OutlineLarge.TButton",
            padding=(18, 12),
            background="#ffffff",
            foreground="#0d6efd",
            borderwidth=1,
            relief="solid",
            font=("Segoe UI", 10, "bold"),
        )
        style.map(
            "OutlineLarge.TButton",
            background=[("active", "#eef5ff"), ("pressed", "#dbeafe")],
        )

        style.configure(
            "Brand.Horizontal.TProgressbar",
            troughcolor="#dee2e6",
            background="#0d6efd",
            lightcolor="#0d6efd",
            darkcolor="#0d6efd",
            bordercolor="#dee2e6",
            thickness=14,
        )

    def _find_logo_path(self) -> Path | None:
        candidates: List[Path] = [
            Path(r"C:\Users\nanda\Downloads\jadwaljaga.png"),
            Path(__file__).resolve().parent / "assets" / "jadwaljaga.png",
        ]

        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            meipass_path = Path(str(meipass))
            candidates.append(meipass_path / "tools" / "scheduler_offline_app" / "assets" / "jadwaljaga.png")
            candidates.append(meipass_path / "assets" / "jadwaljaga.png")

        for path in candidates:
            if path.exists() and path.is_file():
                return path
        return None

    def _resize_photo_image(self, source: tk.PhotoImage, max_width: int, max_height: int) -> tk.PhotoImage:
        if max_width <= 0 or max_height <= 0:
            return source

        factor_w = (source.width() + max_width - 1) // max_width
        factor_h = (source.height() + max_height - 1) // max_height
        factor = max(1, factor_w, factor_h)
        return source.subsample(factor, factor) if factor > 1 else source

    def _load_brand_logo(self) -> None:
        logo_path = self._find_logo_path()
        if not logo_path:
            return

        try:
            raw = tk.PhotoImage(file=str(logo_path))
        except Exception:
            return

        self.logo_image_raw = raw
        self.logo_image_topbar = self._resize_photo_image(raw, max_width=148, max_height=52)
        self.logo_image_welcome = self._resize_photo_image(raw, max_width=260, max_height=112)
        self.logo_image_icon = self._resize_photo_image(raw, max_width=48, max_height=48)
        self._logo_source_path = str(logo_path)

        if self.logo_image_icon is not None:
            try:
                self.root.iconphoto(True, self.logo_image_icon)
            except Exception:
                pass

    @staticmethod
    def _hex_to_rgb(color: str) -> tuple[int, int, int]:
        value = color.strip().lstrip("#")
        if len(value) != 6:
            return (0, 0, 0)
        return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)

    @staticmethod
    def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
        r, g, b = rgb
        return f"#{r:02x}{g:02x}{b:02x}"

    def _mix_color(self, base_color: str, target_color: str, ratio: float) -> str:
        ratio = max(0.0, min(1.0, ratio))
        br, bg, bb = self._hex_to_rgb(base_color)
        tr, tg, tb = self._hex_to_rgb(target_color)
        out = (
            int(br + (tr - br) * ratio),
            int(bg + (tg - bg) * ratio),
            int(bb + (tb - bb) * ratio),
        )
        return self._rgb_to_hex(out)

    def _set_progress_target(self, percent: float, immediate: bool = False) -> None:
        self._progress_target = max(0.0, min(100.0, float(percent)))
        if immediate:
            self.progress_var.set(self._progress_target)
            return
        if self._progress_anim_job is None:
            self._animate_progress_step()

    def _animate_progress_step(self) -> None:
        current = float(self.progress_var.get())
        delta = self._progress_target - current
        if abs(delta) <= 0.15:
            self.progress_var.set(self._progress_target)
            self._progress_anim_job = None
            return

        step = delta * 0.3
        if delta > 0:
            step = max(step, 0.22)
        else:
            step = min(step, -0.22)

        self.progress_var.set(max(0.0, min(100.0, current + step)))
        self._progress_anim_job = self.root.after(24, self._animate_progress_step)

    def _pulse_status_badge(self) -> None:
        if not self._status_badge_pulse:
            self._status_badge_pulse_job = None
            return

        self._status_badge_pulse_on = not self._status_badge_pulse_on
        if self._status_badge_pulse_on:
            pulsed = self._mix_color(self._status_badge_color, "#ffffff", 0.28)
        else:
            pulsed = self._status_badge_color

        self.status_badge_label.configure(bg=pulsed)
        self._status_badge_pulse_job = self.root.after(260, self._pulse_status_badge)

    def _set_status_badge(self, key: str, pulse: bool = False) -> None:
        badge_map = {
            "idle": ("status_badge_idle", "#6c757d"),
            "preparing": ("status_badge_preparing", "#17a2b8"),
            "optimizing": ("status_badge_optimizing", "#0d6efd"),
            "saving": ("status_badge_saving", "#fd7e14"),
            "done": ("status_badge_done", "#28a745"),
            "error": ("status_badge_error", "#dc3545"),
        }
        text_key, color = badge_map.get(key, badge_map["idle"])

        self._status_badge_key = key
        self._status_badge_color = color
        self._status_badge_pulse = pulse
        self._status_badge_pulse_on = False

        self.status_badge_label.configure(
            text=self._tr(text_key),
            bg=self._status_badge_color,
            fg="#ffffff",
        )

        if self._status_badge_pulse_job is not None:
            try:
                self.root.after_cancel(self._status_badge_pulse_job)
            except Exception:
                pass
            self._status_badge_pulse_job = None

        if self._status_badge_pulse:
            self._status_badge_pulse_job = self.root.after(260, self._pulse_status_badge)

    def _build_ui(self) -> None:
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        self.main_container = ttk.Frame(self.root, style="App.TFrame")
        self.main_container.grid(row=0, column=0, sticky="nsew")
        self.main_container.columnconfigure(0, weight=1)
        self.main_container.rowconfigure(4, weight=1)

        self.topbar_frame = tk.Frame(
            self.main_container,
            bg="#343a40",
            height=78,
            highlightthickness=1,
            highlightbackground="#2b3035",
        )
        self.topbar_frame.grid(row=0, column=0, sticky="ew", padx=10, pady=(10, 6))
        self.topbar_frame.grid_propagate(False)
        self.topbar_frame.columnconfigure(1, weight=1)

        self.brand_logo_topbar_label = tk.Label(self.topbar_frame, bg="#343a40")
        if self.logo_image_topbar is not None:
            self.brand_logo_topbar_label.configure(image=self.logo_image_topbar)
        else:
            self.brand_logo_topbar_label.configure(
                text="DD",
                fg="#ffffff",
                bg="#0d6efd",
                font=("Segoe UI", 10, "bold"),
                padx=8,
                pady=4,
            )
        self.brand_logo_topbar_label.grid(row=0, column=0, rowspan=2, sticky="w", padx=(14, 8), pady=6)

        self.brand_title_label = tk.Label(
            self.topbar_frame,
            bg="#343a40",
            fg="#f8f9fa",
            font=("Segoe UI", 14, "bold"),
            anchor="w",
        )
        self.brand_title_label.grid(row=0, column=1, sticky="sw", padx=2, pady=(6, 0))

        self.brand_subtitle_label = tk.Label(
            self.topbar_frame,
            bg="#343a40",
            fg="#ced4da",
            font=("Segoe UI", 9),
            anchor="w",
        )
        self.brand_subtitle_label.grid(row=1, column=1, sticky="nw", padx=2, pady=(0, 8))

        self.theme_badge_label = tk.Label(
            self.topbar_frame,
            bg="#0d6efd",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
        )
        self.theme_badge_label.grid(row=0, column=2, rowspan=2, sticky="e", padx=(14, 8))

        self.status_badge_label = tk.Label(
            self.topbar_frame,
            bg="#6c757d",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
        )
        self.status_badge_label.grid(row=0, column=3, rowspan=2, sticky="e", padx=(0, 14))

        self.path_frame = ttk.LabelFrame(self.main_container, style="Card.TLabelframe")
        self.path_frame.grid(row=1, column=0, sticky="ew", padx=10, pady=8)
        self.path_frame.columnconfigure(1, weight=1)

        self.label_input_excel = ttk.Label(self.path_frame, style="Card.TLabel")
        self.label_input_excel.grid(row=0, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(self.path_frame, textvariable=self.input_path_var, style="App.TEntry").grid(
            row=0, column=1, sticky="ew", padx=6, pady=4
        )
        self.btn_browse_input = ttk.Button(self.path_frame, command=self._browse_input, style="Outline.TButton")
        self.btn_browse_input.grid(
            row=0, column=2, padx=6, pady=4
        )

        self.label_output_excel = ttk.Label(self.path_frame, style="Card.TLabel")
        self.label_output_excel.grid(row=1, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(self.path_frame, textvariable=self.output_path_var, style="App.TEntry").grid(
            row=1, column=1, sticky="ew", padx=6, pady=4
        )
        self.btn_browse_output = ttk.Button(self.path_frame, command=self._browse_output, style="Outline.TButton")
        self.btn_browse_output.grid(
            row=1, column=2, padx=6, pady=4
        )

        self.label_report_folder = ttk.Label(self.path_frame, style="Card.TLabel")
        self.label_report_folder.grid(row=2, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(self.path_frame, textvariable=self.export_folder_var, style="App.TEntry").grid(
            row=2, column=1, sticky="ew", padx=6, pady=4
        )
        self.btn_browse_report_folder = ttk.Button(self.path_frame, command=self._browse_export_folder, style="Outline.TButton")
        self.btn_browse_report_folder.grid(
            row=2, column=2, padx=6, pady=4
        )

        self.cb_export_json = ttk.Checkbutton(
            self.path_frame,
            variable=self.export_json_var,
            style="Card.TCheckbutton",
        )
        self.cb_export_json.grid(
            row=3, column=1, sticky="w", padx=6, pady=4
        )
        self.cb_export_csv = ttk.Checkbutton(
            self.path_frame,
            variable=self.export_csv_var,
            style="Card.TCheckbutton",
        )
        self.cb_export_csv.grid(
            row=3, column=1, sticky="e", padx=6, pady=4
        )

        self.label_language = ttk.Label(self.path_frame, style="Card.TLabel")
        self.label_language.grid(row=4, column=0, sticky="w", padx=6, pady=4)
        self.language_combo = ttk.Combobox(
            self.path_frame,
            style="App.TCombobox",
            state="readonly",
            textvariable=self.language_name_var,
            values=list(LANGUAGE_NAME_TO_CODE.keys()),
            width=14,
        )
        self.language_combo.grid(row=4, column=1, sticky="w", padx=6, pady=4)
        self.language_combo.bind("<<ComboboxSelected>>", self._on_language_selected)

        self.config_frame = ttk.LabelFrame(self.main_container, style="Card.TLabelframe")
        self.config_frame.grid(row=2, column=0, sticky="ew", padx=10, pady=6)

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

        self.flags_frame = ttk.LabelFrame(self.main_container, style="Card.TLabelframe")
        self.flags_frame.grid(row=3, column=0, sticky="ew", padx=10, pady=6)

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
            cb = ttk.Checkbutton(self.flags_frame, variable=var, style="Card.TCheckbutton")
            cb.grid(
                row=r, column=c, sticky="w", padx=10, pady=4
            )
            self.rule_check_widgets[label_key] = cb

        action_frame = ttk.Frame(self.main_container, style="App.TFrame")
        action_frame.grid(row=4, column=0, sticky="nsew", padx=10, pady=8)
        action_frame.columnconfigure(0, weight=1)
        action_frame.rowconfigure(1, weight=1)

        button_bar = ttk.Frame(action_frame, style="App.TFrame")
        button_bar.grid(row=0, column=0, sticky="ew")

        self.preset_btn = ttk.Button(
            button_bar,
            style="Outline.TButton",
            command=self._apply_preset_final_vk,
        )
        self.preset_btn.pack(side="left", padx=4)

        self.save_config_btn = ttk.Button(button_bar, command=self._on_save_config, style="Outline.TButton")
        self.save_config_btn.pack(side="left", padx=4)

        self.load_config_btn = ttk.Button(button_bar, command=self._on_load_config, style="Outline.TButton")
        self.load_config_btn.pack(side="left", padx=4)

        self.reset_config_btn = ttk.Button(button_bar, command=self._on_reset_config, style="Outline.TButton")
        self.reset_config_btn.pack(side="left", padx=4)

        self.analyze_btn = ttk.Button(button_bar, command=self._on_analyze, style="Primary.TButton")
        self.analyze_btn.pack(side="left", padx=4)

        self.generate_btn = ttk.Button(button_bar, command=self._on_generate, style="Primary.TButton")
        self.generate_btn.pack(side="left", padx=4)

        self.copy_btn = ttk.Button(button_bar, command=self._copy_report, style="Outline.TButton")
        self.copy_btn.pack(side="left", padx=4)

        progress_frame = ttk.Frame(action_frame, style="App.TFrame")
        progress_frame.grid(row=1, column=0, sticky="ew", pady=(6, 2))
        progress_frame.columnconfigure(0, weight=1)

        self.progress_bar = ttk.Progressbar(
            progress_frame,
            style="Brand.Horizontal.TProgressbar",
            orient="horizontal",
            mode="determinate",
            maximum=100,
            variable=self.progress_var,
        )
        self.progress_bar.grid(row=0, column=0, sticky="ew", padx=(0, 8))

        self.progress_label = ttk.Label(
            progress_frame,
            style="Muted.TLabel",
            textvariable=self.progress_text_var,
            width=56,
            anchor="w",
        )
        self.progress_label.grid(
            row=0, column=1, sticky="w"
        )

        self.output_text = tk.Text(action_frame, wrap="word")
        self.output_text.grid(row=2, column=0, sticky="nsew", pady=6)
        self.output_text.configure(
            bg="#ffffff",
            fg="#243447",
            insertbackground="#243447",
            relief="flat",
            padx=12,
            pady=10,
            font=("Consolas", 10),
            highlightthickness=1,
            highlightbackground="#d9dee5",
            highlightcolor="#0d6efd",
        )
        scroll = ttk.Scrollbar(action_frame, command=self.output_text.yview)
        scroll.grid(row=2, column=1, sticky="ns")
        self.output_text.configure(yscrollcommand=scroll.set)
        action_frame.rowconfigure(2, weight=1)

        self.footer_label = ttk.Label(self.main_container, style="Footer.TLabel")
        self.footer_label.grid(row=5, column=0, sticky="e", padx=12, pady=(0, 8))

        self.welcome_frame = ttk.Frame(self.root, padding=24, style="App.TFrame")
        self.welcome_frame.grid(row=0, column=0, sticky="nsew")
        self.welcome_frame.columnconfigure(0, weight=1)
        self.welcome_frame.rowconfigure(1, weight=1)

        self.welcome_card = ttk.Frame(self.welcome_frame, style="WelcomeCard.TFrame", padding=(32, 28))
        self.welcome_card.grid(row=0, column=0, sticky="n", pady=(42, 0))
        self.welcome_card.columnconfigure(0, weight=1)

        self.brand_logo_welcome_label = tk.Label(self.welcome_card, bg="#ffffff")
        if self.logo_image_welcome is not None:
            self.brand_logo_welcome_label.configure(image=self.logo_image_welcome)
        else:
            self.brand_logo_welcome_label.configure(
                text="dokterDIBYA",
                fg="#0d6efd",
                bg="#ffffff",
                font=("Segoe UI", 18, "bold"),
            )
        self.brand_logo_welcome_label.grid(row=0, column=0, sticky="n", pady=(0, 8))

        self.welcome_title_label = ttk.Label(self.welcome_card, style="WelcomeTitle.TLabel")
        self.welcome_title_label.grid(row=1, column=0, sticky="n", pady=(4, 10))

        self.welcome_subtitle_label = ttk.Label(self.welcome_card, style="WelcomeSubtitle.TLabel")
        self.welcome_subtitle_label.grid(row=2, column=0, sticky="n", pady=(0, 24))

        self.welcome_vk_btn = ttk.Button(
            self.welcome_card,
            style="PrimaryLarge.TButton",
            width=36,
            command=self._select_mode_vk,
        )
        self.welcome_vk_btn.grid(row=3, column=0, pady=8)

        self.welcome_neonatus_btn = ttk.Button(
            self.welcome_card,
            style="OutlineLarge.TButton",
            width=36,
            command=self._select_mode_neonatus,
        )
        self.welcome_neonatus_btn.grid(row=4, column=0, pady=8)

        self.welcome_footer_label = ttk.Label(self.welcome_frame, style="Footer.TLabel")
        self.welcome_footer_label.grid(row=1, column=0, sticky="s", pady=(0, 10))

    def _add_labeled_entry(
        self,
        parent: ttk.Widget,
        label: str,
        var: tk.StringVar,
        row: int,
        col: int,
        span: int = 1,
    ) -> ttk.Label:
        label_widget = ttk.Label(parent, text=label, style="Card.TLabel")
        label_widget.grid(row=row, column=col, sticky="w", padx=6, pady=4)
        entry = ttk.Entry(parent, textvariable=var, style="App.TEntry")
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
        self.brand_title_label.configure(text=self._tr("app_title"))
        self.brand_subtitle_label.configure(text=self._tr("header_subtitle"))
        self.theme_badge_label.configure(text=self._tr("header_badge"))
        self.footer_label.configure(text=self._tr("footer_developed_by"))
        self.welcome_footer_label.configure(text=self._tr("footer_developed_by"))

        self.welcome_title_label.configure(text=self._tr("welcome_title"))
        self.welcome_subtitle_label.configure(text=self._tr("welcome_subtitle"))
        self.welcome_vk_btn.configure(text=f"🏥 {self._tr('welcome_option_vk')}")
        self.welcome_neonatus_btn.configure(text=f"👶 {self._tr('welcome_option_neonatus')}")

        self.path_frame.configure(text=f"📁 {self._tr('frame_files')}")
        self.config_frame.configure(text=f"⚙ {self._tr('frame_config')}")
        self.flags_frame.configure(text=f"🛡 {self._tr('frame_rules')}")

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

        self.preset_btn.configure(text=f"🎯 {self._tr('btn_apply_preset')}")
        self.save_config_btn.configure(text=f"💾 {self._tr('btn_save_config')}")
        self.load_config_btn.configure(text=f"📂 {self._tr('btn_load_config')}")
        self.reset_config_btn.configure(text=f"♻ {self._tr('btn_reset_config')}")
        self.analyze_btn.configure(text=f"🔍 {self._tr('btn_analyze')}")
        self.generate_btn.configure(text=f"⚡ {self._tr('btn_generate')}")
        self.copy_btn.configure(text=f"📋 {self._tr('btn_copy')}")
        self._set_status_badge(self._status_badge_key, pulse=self._status_badge_pulse)

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
        self._persist_last_config_silent()

    def _select_mode_neonatus(self) -> None:
        self.schedule_mode_var.set("neonatus")
        msg = self._tr("welcome_mode_selected_neonatus")
        self._append_report(self._tr("report_title_mode"), msg)
        messagebox.showinfo(self._tr("info_title"), self._tr("welcome_neonatus_coming_soon"))
        self._persist_last_config_silent()

    def _on_language_selected(self, _event=None) -> None:
        selected = self.language_name_var.get().strip()
        code = LANGUAGE_NAME_TO_CODE.get(selected, "id")
        self.language_code_var.set(code)
        self._apply_language(refresh_progress=True)
        self._append_report(
            self._tr("report_title_language"),
            self._tr("report_language_changed", language=selected),
        )
        self._persist_last_config_silent()

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
            self._persist_last_config_silent()

    def _browse_output(self) -> None:
        p = filedialog.asksaveasfilename(
            title=self._tr("dialog_save_output"),
            defaultextension=".xlsx",
            filetypes=[("Excel files", "*.xlsx")],
        )
        if p:
            self.output_path_var.set(p)
            self._persist_last_config_silent()

    def _browse_export_folder(self) -> None:
        p = filedialog.askdirectory(title=self._tr("dialog_select_report_folder"))
        if p:
            self.export_folder_var.set(p)
            self._persist_last_config_silent()

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

    def _get_last_config_path(self) -> Path:
        local_appdata = os.getenv("LOCALAPPDATA")
        if local_appdata:
            return Path(local_appdata) / CONFIG_DIR_NAME / LAST_CONFIG_FILE_NAME
        return Path.home() / f".{CONFIG_DIR_NAME}" / LAST_CONFIG_FILE_NAME

    @staticmethod
    def _to_bool(value: object, default: bool = False) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "on"}
        return default

    def _collect_current_config(self) -> Dict[str, Any]:
        return {
            "schema_version": CONFIG_SCHEMA_VERSION,
            "language_code": self._language_code(),
            "schedule_mode": self.schedule_mode_var.get().strip(),
            "input_path": self.input_path_var.get().strip(),
            "output_path": self.output_path_var.get().strip(),
            "export_folder": self.export_folder_var.get().strip(),
            "sheet_name": self.sheet_name_var.get().strip(),
            "start_day": self.start_day_var.get().strip(),
            "end_day": self.end_day_var.get().strip(),
            "p_count": self.p_count_var.get().strip(),
            "s_count": self.s_count_var.get().strip(),
            "m_count": self.m_count_var.get().strip(),
            "iterations": self.iterations_var.get().strip(),
            "seed": self.seed_var.get().strip(),
            "temperature": self.temperature_var.get().strip(),
            "top_rank_count": self.top_rank_count_var.get().strip(),
            "top_rank_max_night": self.top_rank_max_night_var.get().strip(),
            "max_core_rank": self.max_core_rank_var.get().strip(),
            "off_targets": self.off_targets_var.get().strip(),
            "uniform_group": self.uniform_group_var.get().strip(),
            "enforce_no_m_to_p": self.enforce_no_m_to_p_var.get(),
            "enforce_mll_each": self.enforce_mll_each_var.get(),
            "enforce_rank_group_not_together": self.enforce_rank_group_not_together_var.get(),
            "enforce_tandem": self.enforce_tandem_var.get(),
            "enforce_top_rank_night_cap": self.enforce_top_rank_night_cap_var.get(),
            "enforce_uniform_group_off": self.enforce_uniform_group_off_var.get(),
            "enforce_uniform_group_night": self.enforce_uniform_group_night_var.get(),
            "enforce_night_monotonic": self.enforce_night_monotonic_var.get(),
            "enforce_off_monotonic": self.enforce_off_monotonic_var.get(),
            "assign_colors": self.assign_colors_var.get(),
            "auto_export_json": self.export_json_var.get(),
            "auto_export_csv": self.export_csv_var.get(),
        }

    def _apply_config_state(self, state: Dict[str, Any]) -> None:
        if not isinstance(state, dict):
            raise ValueError(self._tr("config_invalid_format"))

        self._suspend_auto_persist = True
        try:
            lang_code = str(state.get("language_code", self._language_code())).strip().lower()
            if lang_code in LANGUAGE_CODE_TO_NAME:
                self.language_code_var.set(lang_code)
                self.language_name_var.set(LANGUAGE_CODE_TO_NAME[lang_code])

            self.input_path_var.set(str(state.get("input_path", self.input_path_var.get())).strip())
            self.output_path_var.set(str(state.get("output_path", self.output_path_var.get())).strip())
            self.export_folder_var.set(str(state.get("export_folder", self.export_folder_var.get())).strip())

            self.sheet_name_var.set(str(state.get("sheet_name", self.sheet_name_var.get())).strip() or "JADWAL BARU")
            self.start_day_var.set(str(state.get("start_day", self.start_day_var.get())).strip() or "1")
            self.end_day_var.set(str(state.get("end_day", self.end_day_var.get())).strip() or "31")

            self.p_count_var.set(str(state.get("p_count", self.p_count_var.get())).strip() or "3")
            self.s_count_var.set(str(state.get("s_count", self.s_count_var.get())).strip() or "3")
            self.m_count_var.set(str(state.get("m_count", self.m_count_var.get())).strip() or "3")

            self.iterations_var.set(str(state.get("iterations", self.iterations_var.get())).strip() or "60000")
            self.seed_var.set(str(state.get("seed", self.seed_var.get())).strip() or "707")
            self.temperature_var.set(str(state.get("temperature", self.temperature_var.get())).strip() or "4.5")

            self.top_rank_count_var.set(str(state.get("top_rank_count", self.top_rank_count_var.get())).strip() or "2")
            self.top_rank_max_night_var.set(str(state.get("top_rank_max_night", self.top_rank_max_night_var.get())).strip() or "3")
            self.max_core_rank_var.set(str(state.get("max_core_rank", self.max_core_rank_var.get())).strip() or "14")

            self.off_targets_var.set(str(state.get("off_targets", self.off_targets_var.get())).strip() or "12,12,11,11,10,10,9,9,9,9,9,8,8,8")
            self.uniform_group_var.set(str(state.get("uniform_group", self.uniform_group_var.get())).strip() or "12,13,14")

            self.enforce_no_m_to_p_var.set(self._to_bool(state.get("enforce_no_m_to_p"), True))
            self.enforce_mll_each_var.set(self._to_bool(state.get("enforce_mll_each"), True))
            self.enforce_rank_group_not_together_var.set(self._to_bool(state.get("enforce_rank_group_not_together"), True))
            self.enforce_tandem_var.set(self._to_bool(state.get("enforce_tandem"), True))
            self.enforce_top_rank_night_cap_var.set(self._to_bool(state.get("enforce_top_rank_night_cap"), True))
            self.enforce_uniform_group_off_var.set(self._to_bool(state.get("enforce_uniform_group_off"), True))
            self.enforce_uniform_group_night_var.set(self._to_bool(state.get("enforce_uniform_group_night"), True))
            self.enforce_night_monotonic_var.set(self._to_bool(state.get("enforce_night_monotonic"), True))
            self.enforce_off_monotonic_var.set(self._to_bool(state.get("enforce_off_monotonic"), True))
            self.assign_colors_var.set(self._to_bool(state.get("assign_colors"), True))

            self.export_json_var.set(self._to_bool(state.get("auto_export_json"), True))
            self.export_csv_var.set(self._to_bool(state.get("auto_export_csv"), True))

            mode = str(state.get("schedule_mode", self.schedule_mode_var.get())).strip()
            self.schedule_mode_var.set(mode)

            self._apply_language(refresh_progress=True)

            if mode == "vk_ruangan":
                self._show_main_screen()
            else:
                self._show_welcome_screen()
        finally:
            self._suspend_auto_persist = False

    def _write_config_file(self, path: Path, state: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=True)

    def _persist_last_config_silent(self) -> None:
        if self._suspend_auto_persist:
            return
        try:
            self._write_config_file(self._last_config_path, self._collect_current_config())
        except Exception:
            pass

    def _load_last_config_silent(self) -> None:
        if not self._last_config_path.exists():
            return
        try:
            with self._last_config_path.open("r", encoding="utf-8") as f:
                state = json.load(f)
            self._apply_config_state(state)
            self._append_report(
                self._tr("report_title_config"),
                self._tr("config_autoload_report_fmt", path=str(self._last_config_path)),
            )
        except Exception:
            pass

    def _on_save_config(self) -> None:
        default_file = f"scheduler-config-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        p = filedialog.asksaveasfilename(
            title=self._tr("dialog_save_config"),
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
            initialfile=default_file,
        )
        if not p:
            return

        path = Path(p)
        try:
            self._write_config_file(path, self._collect_current_config())
        except Exception as exc:
            messagebox.showerror(self._tr("error_title"), f"{self._tr('config_apply_failed')}\n\n{exc}")
            return

        msg = self._tr("config_saved_msg_fmt", path=str(path))
        self._append_report(self._tr("report_title_config"), msg)
        messagebox.showinfo(self._tr("info_title"), msg)

    def _on_load_config(self) -> None:
        p = filedialog.askopenfilename(
            title=self._tr("dialog_load_config"),
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
        )
        if not p:
            return

        path = Path(p)
        try:
            with path.open("r", encoding="utf-8") as f:
                state = json.load(f)
            self._apply_config_state(state)
            self._persist_last_config_silent()
        except ValueError as exc:
            messagebox.showerror(self._tr("error_title"), str(exc))
            return
        except Exception as exc:
            messagebox.showerror(self._tr("error_title"), f"{self._tr('config_apply_failed')}\n\n{exc}")
            return

        msg = self._tr("config_loaded_msg_fmt", path=str(path))
        self._append_report(self._tr("report_title_config"), msg)
        messagebox.showinfo(self._tr("info_title"), msg)

    def _on_reset_config(self) -> None:
        defaults = {
            "language_code": "id",
            "schedule_mode": "",
            "input_path": "",
            "output_path": "",
            "export_folder": "",
            "sheet_name": "JADWAL BARU",
            "start_day": "1",
            "end_day": "31",
            "p_count": "3",
            "s_count": "3",
            "m_count": "3",
            "iterations": "60000",
            "seed": "707",
            "temperature": "4.5",
            "top_rank_count": "2",
            "top_rank_max_night": "3",
            "max_core_rank": "14",
            "off_targets": "12,12,11,11,10,10,9,9,9,9,9,8,8,8",
            "uniform_group": "12,13,14",
            "enforce_no_m_to_p": True,
            "enforce_mll_each": True,
            "enforce_rank_group_not_together": True,
            "enforce_tandem": True,
            "enforce_top_rank_night_cap": True,
            "enforce_uniform_group_off": True,
            "enforce_uniform_group_night": True,
            "enforce_night_monotonic": True,
            "enforce_off_monotonic": True,
            "assign_colors": True,
            "auto_export_json": True,
            "auto_export_csv": True,
        }
        self._apply_config_state(defaults)
        self._set_progress_target(0.0, immediate=True)
        self.progress_text_var.set(
            self._tr("progress_percent_fmt", percent=0, text=self._tr("progress_idle"))
        )
        self._set_status_badge("idle", pulse=False)
        self._persist_last_config_silent()
        self._append_report(self._tr("report_title_config"), self._tr("config_reset_msg"))
        messagebox.showinfo(self._tr("info_title"), self._tr("config_reset_msg"))

    def _on_app_close(self) -> None:
        if self._progress_anim_job is not None:
            try:
                self.root.after_cancel(self._progress_anim_job)
            except Exception:
                pass
        if self._status_badge_pulse_job is not None:
            try:
                self.root.after_cancel(self._status_badge_pulse_job)
            except Exception:
                pass
        self._persist_last_config_silent()
        self.root.destroy()

    def _set_busy(self, busy: bool) -> None:
        state = "disabled" if busy else "normal"
        self.language_combo.configure(state="disabled" if busy else "readonly")
        self.preset_btn.configure(state=state)
        self.save_config_btn.configure(state=state)
        self.load_config_btn.configure(state=state)
        self.reset_config_btn.configure(state=state)
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

        self._set_progress_target(0.0, immediate=True)
        self.progress_text_var.set(self._tr("preset_applied_status"))
        self._set_status_badge("idle", pulse=False)
        self._append_report(self._tr("report_title_preset"), self._tr("preset_report_message"))
        self._persist_last_config_silent()

    def _run_background(self, worker, generate_mode: bool = False) -> None:
        self._set_busy(True)
        self._is_generating = generate_mode
        if generate_mode:
            self._clear_progress_queue()
            self._set_progress_target(0.0, immediate=True)
            self.progress_text_var.set(
                self._tr(
                    "progress_percent_fmt",
                    percent=0,
                    text=self._tr("progress_starting"),
                )
            )
            self._set_status_badge("preparing", pulse=True)
        else:
            self._set_status_badge("optimizing", pulse=True)

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
        self._set_status_badge("done", pulse=False)

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
                self._set_progress_target(100.0)
                self.progress_text_var.set(
                    self._tr(
                        "progress_percent_fmt",
                        percent=100,
                        text=self._tr("progress_generate_complete"),
                    )
                )
                self._persist_last_config_silent()
            return

        self._append_report(self._tr("report_title_result"), result)

    def _on_worker_error(self, err: str) -> None:
        self._drain_progress_queue_once()
        self._set_busy(False)
        self._is_generating = False
        self._set_status_badge("error", pulse=False)
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
        self._set_progress_target(progress * 100.0)
        percent = int(round(progress * 100.0))

        phase = str(payload.get("phase", "optimize"))
        iteration = payload.get("iteration")
        total_iterations = payload.get("total_iterations")
        elapsed = self._format_seconds(payload.get("elapsed_sec"))
        eta = self._format_seconds(payload.get("eta_sec"))

        if phase == "optimize" and iteration is not None and total_iterations is not None:
            self._set_status_badge("optimizing", pulse=True)
            text = self._tr(
                "progress_optimizing_fmt",
                iteration=iteration,
                total=total_iterations,
                elapsed=elapsed,
                eta=eta,
            )
        elif phase == "prepare":
            self._set_status_badge("preparing", pulse=True)
            text = self._tr("progress_preparing")
        elif phase == "save":
            self._set_status_badge("saving", pulse=True)
            text = self._tr("progress_saving_fmt", elapsed=elapsed)
        elif phase == "done":
            self._set_status_badge("done", pulse=False)
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
