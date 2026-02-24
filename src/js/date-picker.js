class DateRangePicker {
  constructor(options = {}) {
    this.options = {
      onApply: options.onApply || (() => {}),
      initialStartDate: options.startDate || new Date(),
      initialEndDate: options.endDate || new Date(),
      attachTo: options.attachTo || null, // Optional: auto-bind trigger
    };

    // State
    this.startDate = this.normalizeDate(this.options.initialStartDate);
    this.endDate = this.normalizeDate(this.options.initialEndDate);
    this.viewDate = new Date(this.startDate); // Determine left calendar month
    
    // UI Elements
    this.modal = null;
    this.startInput = null;
    this.endInput = null;

    this.init();
  }

  normalizeDate(date) {
    if (!date) return null;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  formatDate(date) {
    if (!date) return '';
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  }

  parseDate(str) {
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    return date;
  }

  init() {
    this.createModal();
    this.addEventListeners();
    this.updateInputs();
    this.renderCalendars();
  }

  createModal() {
    const modal = document.createElement('div');
    modal.className = 'date-picker-modal';
    modal.innerHTML = `
      <div class="date-picker-content">
        <div class="date-picker-header">
          <div class="date-picker-input-group">
            <label>Tanggal Mulai</label>
            <input type="text" class="dp-start-input" placeholder="DD-MM-YYYY">
          </div>
          <div class="date-picker-input-group">
            <label>Tanggal Selesai</label>
            <input type="text" class="dp-end-input" placeholder="DD-MM-YYYY">
          </div>
        </div>
        <div class="date-picker-body">
          <div class="date-picker-sidebar">
            <button class="date-picker-preset-btn" data-preset="today">Hari Ini</button>
            <button class="date-picker-preset-btn" data-preset="yesterday">Kemarin</button>
            <button class="date-picker-preset-btn" data-preset="last7">7 Hari Terakhir</button>
            <button class="date-picker-preset-btn" data-preset="last30">30 Hari Terakhir</button>
            <button class="date-picker-preset-btn" data-preset="thisMonth">Bulan Ini</button>
            <button class="date-picker-preset-btn" data-preset="lastMonth">Bulan Lalu</button>
          </div>
          <div class="date-picker-calendars">
            <div class="calendar-wrapper" id="calendar-left"></div>
            <div class="calendar-wrapper" id="calendar-right"></div>
          </div>
        </div>
        <div class="date-picker-footer">
          <button class="btn btn-neutral dp-cancel-btn">Batal</button>
          <button class="btn btn-primary dp-apply-btn">Terapkan</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.modal = modal;
    this.startInput = modal.querySelector('.dp-start-input');
    this.endInput = modal.querySelector('.dp-end-input');
  }

  addEventListeners() {
    // Buttons
    this.modal.querySelector('.dp-cancel-btn').addEventListener('click', () => this.hide());
    this.modal.querySelector('.dp-apply-btn').addEventListener('click', () => this.apply());

    // Inputs
    this.startInput.addEventListener('change', (e) => this.handleInputChange(e.target.value, 'start'));
    this.endInput.addEventListener('change', (e) => this.handleInputChange(e.target.value, 'end'));

    // Presets
    const presets = this.modal.querySelectorAll('.date-picker-preset-btn');
    presets.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.applyPreset(e.target.dataset.preset);
        presets.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Outside click to close (optional, but requested layout implies modal)
    this.modal.addEventListener('mousedown', (e) => {
      if (e.target === this.modal) this.hide();
    });
  }

  handleInputChange(value, type) {
    const date = this.parseDate(value);
    const input = type === 'start' ? this.startInput : this.endInput;

    if (date) {
      input.classList.remove('invalid');
      if (type === 'start') {
        this.startDate = date;
        if (this.startDate > this.endDate) {
          this.endDate = new Date(this.startDate);
        }
      } else {
        this.endDate = date;
        if (this.endDate < this.startDate) {
          this.startDate = new Date(this.endDate);
        }
      }
      this.viewDate = new Date(this.startDate || new Date());
      this.updateInputs();
      this.renderCalendars();
    } else {
      input.classList.add('invalid');
    }
  }

  applyPreset(preset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let start, end;
    
    switch (preset) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(start);
        break;
      case 'last7':
        end = new Date(today);
        start = new Date(today);
        start.setDate(today.getDate() - 6);
        break;
      case 'last30':
        end = new Date(today);
        start = new Date(today);
        start.setDate(today.getDate() - 29);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
    }

    if (start && end) {
      this.startDate = start;
      this.endDate = end;
      this.viewDate = new Date(start);
      this.updateInputs();
      this.renderCalendars();
    }
  }

  updateInputs() {
    if (this.startInput) this.startInput.value = this.formatDate(this.startDate);
    if (this.endInput) this.endInput.value = this.formatDate(this.endDate);
    
    // Remove invalid classes if any
    this.startInput.classList.remove('invalid');
    this.endInput.classList.remove('invalid');
  }

  renderCalendars() {
    const leftContainer = this.modal.querySelector('#calendar-left');
    const rightContainer = this.modal.querySelector('#calendar-right');

    const leftDate = new Date(this.viewDate);
    leftDate.setDate(1);
    
    const rightDate = new Date(leftDate);
    rightDate.setMonth(rightDate.getMonth() + 1);

    leftContainer.innerHTML = this.buildCalendarHTML(leftDate, true);
    rightContainer.innerHTML = this.buildCalendarHTML(rightDate, false);

    // Attach calendar listeners
    this.attachCalendarListeners(leftContainer, leftDate);
    this.attachCalendarListeners(rightContainer, rightDate);
  }

  buildCalendarHTML(date, isLeft) {
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const month = date.getMonth();
    const year = date.getFullYear();

    // Nav buttons
    const prevBtn = isLeft ? `<button class="calendar-nav-btn prev-month">&lt;</button>` : `<div></div>`;
    const nextBtn = !isLeft ? `<button class="calendar-nav-btn next-month">&gt;</button>` : `<div></div>`;

    let html = `
      <div class="calendar-header">
        ${prevBtn}
        <span class="calendar-month-year">${monthNames[month]} ${year}</span>
        ${nextBtn}
      </div>
      <div class="calendar-grid">
        <div class="calendar-day-header">Sen</div>
        <div class="calendar-day-header">Sel</div>
        <div class="calendar-day-header">Rab</div>
        <div class="calendar-day-header">Kam</div>
        <div class="calendar-day-header">Jum</div>
        <div class="calendar-day-header">Sab</div>
        <div class="calendar-day-header">Min</div>
    `;

    // Days calculation
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Adjust for Monday start (0=Sun, 1=Mon... 6=Sat) -> transform so 0=Mon... 6=Sun
    let startDayOfWeek = firstDay.getDay() - 1; 
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday becomes 6

    // Empty cells before start
    for (let i = 0; i < startDayOfWeek; i++) {
      html += `<div class="calendar-day empty"></div>`;
    }

    // Days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const current = new Date(year, month, i);
      const isStart = this.isSameDate(current, this.startDate);
      const isEnd = this.isSameDate(current, this.endDate);
      const inRange = this.startDate && this.endDate && current > this.startDate && current < this.endDate;

      let classes = ['calendar-day'];
      if (isStart) classes.push('start-date');
      if (isEnd) classes.push('end-date');
      if (inRange) classes.push('in-range');

      html += `<div class="${classes.join(' ')}" data-date="${i}" data-month="${month}" data-year="${year}">${i}</div>`;
    }

    html += `</div>`;
    return html;
  }

  attachCalendarListeners(container, baseDate) {
    // Nav buttons
    const prev = container.querySelector('.prev-month');
    const next = container.querySelector('.next-month');

    if (prev) {
      prev.addEventListener('click', () => {
        this.viewDate.setMonth(this.viewDate.getMonth() - 1);
        this.renderCalendars();
      });
    }

    if (next) {
      next.addEventListener('click', () => {
        this.viewDate.setMonth(this.viewDate.getMonth() + 1);
        this.renderCalendars();
      });
    }

    // Day clicks
    const days = container.querySelectorAll('.calendar-day:not(.empty)');
    days.forEach(day => {
      day.addEventListener('click', () => {
        const d = parseInt(day.dataset.date);
        const m = parseInt(day.dataset.month);
        const y = parseInt(day.dataset.year);
        const clickedDate = new Date(y, m, d);

        this.handleDateClick(clickedDate);
      });
    });
  }

  handleDateClick(date) {
    if (!this.startDate || (this.startDate && this.endDate)) {
      // Start new selection
      this.startDate = date;
      this.endDate = null;
    } else if (this.startDate && !this.endDate) {
      if (date < this.startDate) {
        this.endDate = this.startDate;
        this.startDate = date;
      } else {
        this.endDate = date;
      }
    }
    
    this.updateInputs();
    this.renderCalendars();
  }

  isSameDate(d1, d2) {
    if (!d1 || !d2) return false;
    return d1.getDate() === d2.getDate() && 
           d1.getMonth() === d2.getMonth() && 
           d1.getFullYear() === d2.getFullYear();
  }

  setDateRange(start, end) {
    if (start) this.startDate = this.normalizeDate(start);
    if (end) this.endDate = this.normalizeDate(end);
    if (this.startDate) this.viewDate = new Date(this.startDate);
    this.updateInputs();
    this.renderCalendars();
  }

  show() {
    this.modal.classList.add('visible');
    this.updateInputs();
    this.renderCalendars();
  }

  hide() {
    this.modal.classList.remove('visible');
  }

  apply() {
    if (this.startDate && this.endDate) {
      this.options.onApply(this.startDate, this.endDate);
      this.hide();
    } else {
      alert('Silakan pilih rentang tanggal yang lengkap.');
    }
  }
}

// Export if needed, or just attach to window
window.DateRangePicker = DateRangePicker;

/* ============================
   Single Date Picker
   ============================ */
class SingleDatePicker {
  constructor(options = {}) {
    this.options = {
      onApply: options.onApply || (() => {}),
      initialDate: options.initialDate || new Date(),
    };

    this.selectedDate = this.normalizeDate(this.options.initialDate);
    this.viewDate = new Date(this.selectedDate);

    this.modal = null;
    this.dateInput = null;

    this.init();
  }

  normalizeDate(date) {
    if (!date) return new Date();
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  formatDate(date) {
    if (!date) return '';
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  }

  parseDate(str) {
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    return date;
  }

  isSameDate(d1, d2) {
    if (!d1 || !d2) return false;
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
  }

  init() {
    this.createModal();
    this.addEventListeners();
    this.updateInput();
    this.renderCalendar();
  }

  createModal() {
    const modal = document.createElement('div');
    modal.className = 'date-picker-modal';
    modal.innerHTML = `
      <div class="single-date-picker-content">
        <div class="single-date-picker-header">
          <div class="date-picker-input-group">
            <label>Pilih Tanggal</label>
            <input type="text" class="sdp-input" placeholder="DD-MM-YYYY">
          </div>
        </div>
        <div class="single-date-picker-body">
          <div class="single-date-picker-presets">
            <button class="date-picker-preset-btn" data-preset="today">Hari Ini</button>
            <button class="date-picker-preset-btn" data-preset="yesterday">Kemarin</button>
          </div>
          <div class="single-date-picker-calendar" id="sdp-calendar"></div>
        </div>
        <div class="date-picker-footer">
          <button class="btn btn-neutral sdp-cancel-btn">Batal</button>
          <button class="btn btn-primary sdp-apply-btn">Terapkan</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.modal = modal;
    this.dateInput = modal.querySelector('.sdp-input');
  }

  addEventListeners() {
    this.modal.querySelector('.sdp-cancel-btn').addEventListener('click', () => this.hide());
    this.modal.querySelector('.sdp-apply-btn').addEventListener('click', () => this.apply());

    this.dateInput.addEventListener('change', () => {
      const date = this.parseDate(this.dateInput.value);
      if (date) {
        this.dateInput.classList.remove('invalid');
        this.selectedDate = date;
        this.viewDate = new Date(date);
        this.renderCalendar();
      } else {
        this.dateInput.classList.add('invalid');
      }
    });

    const presets = this.modal.querySelectorAll('.date-picker-preset-btn');
    presets.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.applyPreset(e.target.dataset.preset);
        presets.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    this.modal.addEventListener('mousedown', (e) => {
      if (e.target === this.modal) this.hide();
    });
  }

  applyPreset(preset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (preset) {
      case 'today':
        this.selectedDate = new Date(today);
        break;
      case 'yesterday': {
        const d = new Date(today);
        d.setDate(d.getDate() - 1);
        this.selectedDate = d;
        break;
      }
    }

    this.viewDate = new Date(this.selectedDate);
    this.updateInput();
    this.renderCalendar();
  }

  updateInput() {
    if (this.dateInput) {
      this.dateInput.value = this.formatDate(this.selectedDate);
      this.dateInput.classList.remove('invalid');
    }
  }

  renderCalendar() {
    const container = this.modal.querySelector('#sdp-calendar');
    if (!container) return;

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    const month = this.viewDate.getMonth();
    const year = this.viewDate.getFullYear();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = `
      <div class="calendar-header">
        <button class="calendar-nav-btn sdp-prev-month">&lt;</button>
        <span class="calendar-month-year">${monthNames[month]} ${year}</span>
        <button class="calendar-nav-btn sdp-next-month">&gt;</button>
      </div>
      <div class="calendar-grid">
        <div class="calendar-day-header">Sen</div>
        <div class="calendar-day-header">Sel</div>
        <div class="calendar-day-header">Rab</div>
        <div class="calendar-day-header">Kam</div>
        <div class="calendar-day-header">Jum</div>
        <div class="calendar-day-header">Sab</div>
        <div class="calendar-day-header">Min</div>
    `;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    for (let i = 0; i < startDayOfWeek; i++) {
      html += `<div class="calendar-day empty"></div>`;
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const current = new Date(year, month, i);
      const isSelected = this.isSameDate(current, this.selectedDate);
      const isToday = this.isSameDate(current, today);

      let classes = ['calendar-day'];
      if (isSelected) classes.push('selected-date');
      if (isToday) classes.push('today-marker');

      html += `<div class="${classes.join(' ')}" data-date="${i}" data-month="${month}" data-year="${year}">${i}</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    // Attach listeners
    container.querySelector('.sdp-prev-month').addEventListener('click', () => {
      this.viewDate.setMonth(this.viewDate.getMonth() - 1);
      this.renderCalendar();
    });

    container.querySelector('.sdp-next-month').addEventListener('click', () => {
      this.viewDate.setMonth(this.viewDate.getMonth() + 1);
      this.renderCalendar();
    });

    container.querySelectorAll('.calendar-day:not(.empty)').forEach(day => {
      day.addEventListener('click', () => {
        const d = parseInt(day.dataset.date);
        const m = parseInt(day.dataset.month);
        const y = parseInt(day.dataset.year);
        this.selectedDate = new Date(y, m, d);
        this.updateInput();
        this.renderCalendar();
      });
    });
  }

  setDate(date) {
    if (date) {
      this.selectedDate = this.normalizeDate(date);
      this.viewDate = new Date(this.selectedDate);
      this.updateInput();
      this.renderCalendar();
    }
  }

  show() {
    this.modal.classList.add('visible');
    this.updateInput();
    this.renderCalendar();
  }

  hide() {
    this.modal.classList.remove('visible');
  }

  apply() {
    if (this.selectedDate) {
      this.options.onApply(this.selectedDate);
      this.hide();
    }
  }
}

window.SingleDatePicker = SingleDatePicker;
