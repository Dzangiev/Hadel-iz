import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, isToday, parseISO, startOfWeek, endOfWeek, isSameMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CustomCalendarProps {
    /** Текущее выбранное значение в формате 'yyyy-MM-dd' или объект Date */
    value: Date | string;
    onChange: (date: Date) => void;
    onClose: () => void;
}

export function CustomCalendar({ value, onChange, onClose }: CustomCalendarProps) {
    const selected = typeof value === 'string' ? parseISO(value) : value;
    const [viewMonth, setViewMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);

    // Получаем полное начало и конец календаря по неделям (ПН-ВС)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const handleDayClick = (d: Date) => {
        onChange(d);
        onClose();
    };

    return (
        <div className="cal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="cal-sheet">
                <div className="cal-handle" />
                {/* Header */}
                <div className="cal-header">
                    <button className="cal-nav-btn" onClick={() => setViewMonth(subMonths(viewMonth, 1))}>
                        <ChevronLeft size={20} strokeWidth={2.5} />
                    </button>
                    <span className="cal-month-title">
                        {format(viewMonth, 'LLLL yyyy', { locale: ru }).replace(/^./, c => c.toUpperCase())}
                    </span>
                    <button className="cal-nav-btn" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
                        <ChevronRight size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Weekday labels */}
                <div className="cal-weekdays">
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                        <span key={d} className="cal-weekday">{d}</span>
                    ))}
                </div>

                {/* Days grid */}
                <div className="cal-grid">
                    {days.map(d => {
                        const isCurrentMonth = isSameMonth(d, viewMonth);
                        return (
                            <button
                                key={d.toISOString()}
                                className={[
                                    'cal-cell',
                                    isSameDay(d, selected) ? 'cal-cell--selected' : '',
                                    isToday(d) && !isSameDay(d, selected) ? 'cal-cell--today' : '',
                                    !isCurrentMonth ? 'cal-cell--muted' : '',
                                ].join(' ').trim()}
                                onClick={() => handleDayClick(d)}
                            >
                                {format(d, 'd')}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
