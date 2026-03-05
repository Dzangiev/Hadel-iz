import { format, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CustomCalendar } from './CustomCalendar';

interface Props {
    date: Date;
    onChange: (date: Date) => void;
}

export function DateSelector({ date, onChange }: Props) {
    const [calOpen, setCalOpen] = useState(false);

    const formatted = format(date, 'd MMMM, EEEEEE', { locale: ru });
    const label = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    const today = isToday(date);

    return (
        <div className="header-date-wrapper">
            <button
                className={`header-date-btn${today ? ' today' : ''}`}
                onClick={() => setCalOpen(true)}
                aria-label="Выбрать дату"
            >
                {label}
            </button>

            {calOpen && createPortal(
                <CustomCalendar
                    value={date}
                    onChange={(d) => { onChange(d); setCalOpen(false); }}
                    onClose={() => setCalOpen(false)}
                />,
                document.body
            )}
        </div>
    );
}
