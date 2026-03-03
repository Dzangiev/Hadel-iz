import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Хук для анимированного закрытия bottom sheet.
 *
 * Логика:
 *  1. requestClose() → добавляет класс 'closing' на overlay (CSS animates)
 *  2. onAnimationEnd → когда fadeOut завершился, вызывает реальный onClose()
 *
 * isOpen нужен только для сброса isClosing при повторном открытии.
 */
export function useSheetClose(isOpen: boolean, onClose: () => void) {
    const [isClosing, setIsClosing] = useState(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    // Сбрасываем флаг при открытии
    useEffect(() => {
        if (isOpen) setIsClosing(false);
    }, [isOpen]);

    const requestClose = useCallback(() => {
        setIsClosing(true);
    }, []);

    const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
        if (e.animationName === 'fadeOut') {
            setIsClosing(false);
            onCloseRef.current();
        }
    }, []);

    return { isClosing, requestClose, handleAnimationEnd };
}
