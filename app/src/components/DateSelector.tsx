import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useRef } from 'react';

interface Props {
    date: Date;
    onChange: (date: Date) => void;
}

export function DateSelector({ date, onChange }: Props) {
    const dateInputRef = useRef<HTMLInputElement>(null);

    const handlePrev = () => onChange(subDays(date, 1));
    const handleNext = () => onChange(addDays(date, 1));
    const handleToday = () => onChange(new Date());

    const isCurrentToday = isToday(date);
    const formattedDate = format(date, 'd MMMM, EE', { locale: ru });
    const displayTitle = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

    const handleDateClick = () => {
        if (dateInputRef.current) {
            // @ts-ignore - showPicker is supported in modern browsers
            dateInputRef.current.showPicker?.() || dateInputRef.current.focus();
        }
    };

    const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value) {
            onChange(parseISO(e.target.value));
        }
    };

    return (
        <div className="date-selector">
            <button className="date-arrow-btn" onClick={handlePrev} aria-label="Предыдущий день">
                <ChevronLeft size={22} />
            </button>

            <div className="date-display-wrapper">
                <button className="date-main-btn" onClick={handleDateClick}>
                    <CalendarDays size={18} />
                    <span>{displayTitle}</span>
                </button>
                <input
                    type="date"
                    ref={dateInputRef}
                    className="hidden-date-input"
                    value={format(date, 'yyyy-MM-dd')}
                    onChange={handleNativeChange}
                />
                {!isCurrentToday && (
                    <button className="date-back-btn" onClick={handleToday}>
                        ↩ Вернуться на сегодня
                    </button>
                )}
            </div>

            <button className="date-arrow-btn" onClick={handleNext} aria-label="Следующий день">
                <ChevronRight size={22} />
            </button>
        </div>
    );
}
