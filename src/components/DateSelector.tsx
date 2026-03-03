import { format, parseISO, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useRef } from 'react';

interface Props {
    date: Date;
    onChange: (date: Date) => void;
}

export function DateSelector({ date, onChange }: Props) {
    const dateInputRef = useRef<HTMLInputElement>(null);

    const handleClick = () => {
        // @ts-ignore
        dateInputRef.current?.showPicker?.() || dateInputRef.current?.focus();
    };

    const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value) onChange(parseISO(e.target.value));
    };

    const formatted = format(date, 'd MMMM, EEEE', { locale: ru });
    const label = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    const today = isToday(date);

    return (
        <div className="header-date-wrapper">
            <button
                className={`header-date-btn${today ? ' today' : ''}`}
                onClick={handleClick}
                aria-label="Выбрать дату"
            >
                {label}
            </button>
            <input
                type="date"
                ref={dateInputRef}
                className="hidden-date-input"
                value={format(date, 'yyyy-MM-dd')}
                onChange={handleNativeChange}
            />
        </div>
    );
}
