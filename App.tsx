import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Ruler, SquareFunction, Delete, Clock, Trash2, X } from 'lucide-react';
import { HistoryItem, ButtonType } from './types';

// Audio Feedback Utility
const playClickSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    // Frequency sweep for a "tick" sound
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.05);
    
    // Auto-close context to save resources
    setTimeout(() => audioCtx.close(), 100);
  } catch (e) {
    console.warn('Audio feedback failed', e);
  }
};

// Components defined outside for performance
const CalcButton: React.FC<{
  label: string | React.ReactNode;
  type: ButtonType;
  onClick: () => void;
  className?: string;
  active?: boolean;
  disabled?: boolean;
}> = ({ label, type, onClick, className = '', active = false, disabled = false }) => {
  const handleBtnClick = () => {
    if (!disabled) {
      playClickSound();
      onClick();
    }
  };

  const getStyles = () => {
    if (disabled) return 'text-zinc-600 bg-transparent cursor-not-allowed opacity-40';
    
    // Base styles + dynamic colors + active state transitions
    let colorClasses = '';
    
    if (active) {
      colorClasses = 'text-[#30b134] bg-[#252525] ring-1 ring-[#30b134]/30';
    } else {
      switch (type) {
        case ButtonType.OPERATOR:
          colorClasses = 'text-[#30b134] bg-transparent active:bg-zinc-800/50 hover:bg-zinc-900/30';
          break;
        case ButtonType.EQUALS:
          colorClasses = 'text-white bg-[#30b134] active:bg-[#39d33d] shadow-lg shadow-[#30b134]/20';
          break;
        case ButtonType.ACTION:
          colorClasses = 'text-[#ff4d4d] bg-transparent active:bg-zinc-800/50 hover:bg-zinc-900/30';
          break;
        default:
          colorClasses = 'text-white bg-[#1a1a1a] active:bg-[#2a2a2a] hover:bg-[#222]';
      }
    }

    return colorClasses;
  };

  return (
    <button
      onClick={handleBtnClick}
      className={`
        relative flex items-center justify-center rounded-full 
        transition-all duration-150 ease-out
        ${!disabled ? 'active:scale-95' : ''} 
        ${getStyles()} 
        ${className}
      `}
      style={{ width: '100%', aspectRatio: '1/1', fontSize: '1.25rem' }}
    >
      <span className="font-medium pointer-events-none">{label}</span>
      {!disabled && (
        <span className="absolute inset-0 rounded-full bg-white opacity-0 active:opacity-5 transition-opacity duration-100" />
      )}
    </button>
  );
};

const App: React.FC = () => {
  const [expression, setExpression] = useState('');
  const [resultPreview, setResultPreview] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isScientificOpen, setIsScientificOpen] = useState(false);
  const [angleUnit, setAngleUnit] = useState<'deg' | 'rad'>('deg');
  const [memory, setMemory] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll history to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const calculate = (expr: string): string => {
    if (!expr) return '';
    try {
      // Basic sanitization and mapping to JavaScript Math functions
      let cleanExpr = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/%/g, '/100')
        .replace(/π/g, 'Math.PI')
        .replace(/e/g, 'Math.E')
        // Wrap trig functions to handle deg/rad
        .replace(/sin\(/g, 'trigSin(')
        .replace(/cos\(/g, 'trigCos(')
        .replace(/tan\(/g, 'trigTan(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/√\(/g, 'Math.sqrt(')
        .replace(/\^/g, '**');

      // Check for unclosed parentheses and close them for preview/calculation
      const openBrackets = (cleanExpr.match(/\(/g) || []).length;
      const closeBrackets = (cleanExpr.match(/\)/g) || []).length;
      if (openBrackets > closeBrackets) {
        cleanExpr += ')'.repeat(openBrackets - closeBrackets);
      }

      // Check for specific math errors like division by zero
      if (/\/0(?!\.)/.test(cleanExpr) || /\/0\.0*($|[+\-*\/])/.test(cleanExpr)) {
        return "Can't divide by zero";
      }

      // Context with trig wrappers
      const factor = angleUnit === 'deg' ? Math.PI / 180 : 1;
      const trigSin = (x: number) => Math.sin(x * factor);
      const trigCos = (x: number) => Math.cos(x * factor);
      const trigTan = (x: number) => Math.tan(x * factor);

      // Create function with injected helpers
      const fn = new Function('trigSin', 'trigCos', 'trigTan', `return ${cleanExpr}`);
      const result = fn(trigSin, trigCos, trigTan);
      
      if (typeof result !== 'number') return 'Invalid format';
      if (isNaN(result)) return 'Invalid input';
      if (!isFinite(result)) {
        if (result === Infinity || result === -Infinity) return "Value too large";
        return 'Error';
      }
      
      const roundedResult = Math.abs(result) < 1e-12 ? 0 : result;
      const formatted = Number(roundedResult.toPrecision(12)).toString();
      return formatted;
    } catch (err) {
      if (err instanceof SyntaxError) return 'Invalid format';
      return 'Error';
    }
  };

  const updatePreview = (expr: string) => {
    const hasOperators = /[+\-×÷%^]|sin|cos|tan|log|ln|√/.test(expr);
    if (hasOperators) {
      const res = calculate(expr);
      const isErrorMessage = ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(res);
      setResultPreview(!isErrorMessage && res !== '' ? res : null);
    } else {
      setResultPreview(null);
    }
  };

  const handleInput = useCallback((val: string) => {
    setExpression(prev => {
      const isError = ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(prev);
      const next = (isError ? '' : prev) + val;
      updatePreview(next);
      return next;
    });
  }, [angleUnit]);

  const handleOperator = useCallback((op: string) => {
    setExpression(prev => {
      const isError = ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(prev);
      const base = isError ? '0' : prev;

      if (!base && !['-', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', '√(', 'π', 'e'].includes(op)) return base;
      if (/[+\-×÷]$/.test(base) && /[+\-×÷]/.test(op)) {
        return base.slice(0, -1) + op;
      }
      const next = base + op;
      updatePreview(next);
      return next;
    });
  }, [angleUnit]);

  const handleClear = useCallback(() => {
    setExpression('');
    setResultPreview(null);
  }, []);

  const handleBackspace = useCallback(() => {
    playClickSound();
    setExpression(prev => {
      const isError = ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(prev);
      if (isError) {
        setResultPreview(null);
        return '';
      }
      let next = prev;
      if (prev.endsWith('sin(') || prev.endsWith('cos(') || prev.endsWith('tan(') || prev.endsWith('log(')) {
        next = prev.slice(0, -4);
      } else if (prev.endsWith('ln(') || prev.endsWith('√(')) {
        next = prev.slice(0, -3);
      } else {
        next = prev.slice(0, -1);
      }
      updatePreview(next);
      return next;
    });
  }, [angleUnit]);

  const handleEquals = useCallback(() => {
    if (!expression) return;
    const isErrorState = ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(expression);
    if (isErrorState) return;

    const finalResult = calculate(expression);
    const isErrorResult = ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(finalResult);
    
    if (finalResult && !isErrorResult) {
      const newItem: HistoryItem = {
        expression,
        result: finalResult,
        timestamp: Date.now(),
      };
      setHistory(prev => [...prev, newItem]);
      setExpression(finalResult);
      setResultPreview(null);
    } else if (finalResult) {
      setExpression(finalResult);
      setResultPreview(null);
    }
  }, [expression, angleUnit]);

  // Memory functions
  const handleMemoryClear = () => setMemory(0);
  const handleMemoryRecall = () => {
    setExpression(prev => {
      const isError = ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(prev);
      const next = (isError ? '' : prev) + memory.toString();
      updatePreview(next);
      return next;
    });
  };
  const handleMemoryAdd = () => {
    const currentVal = calculate(expression || '0');
    if (!["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(currentVal) && currentVal !== '') {
      setMemory(prev => prev + parseFloat(currentVal));
    }
  };
  const handleMemorySubtract = () => {
    const currentVal = calculate(expression || '0');
    if (!["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(currentVal) && currentVal !== '') {
      setMemory(prev => prev - parseFloat(currentVal));
    }
  };

  useEffect(() => {
    updatePreview(expression);
  }, [angleUnit, expression]);

  const clearHistory = () => setHistory([]);

  return (
    <div className="flex items-center justify-center h-screen w-screen bg-black overflow-hidden select-none">
      <div className="relative w-full max-w-md h-full md:max-h-[850px] bg-black text-white flex flex-col shadow-2xl overflow-hidden border-x border-zinc-900">
        
        {/* History Panel */}
        <div className={`absolute inset-0 bg-black z-50 transition-transform duration-400 cubic-bezier(0.22, 1, 0.36, 1) transform ${isHistoryOpen ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex flex-col h-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">History</h2>
              <button 
                onClick={() => { playClickSound(); setIsHistoryOpen(false); }} 
                className="p-2 rounded-full hover:bg-zinc-800 active:scale-90 transition-all"
              >
                <X size={24} />
              </button>
            </div>
            
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-6 px-2">
              {history.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-500 font-light italic">
                  No history found
                </div>
              ) : (
                history.map((item, idx) => (
                  <div key={idx} className="text-right group cursor-pointer active:opacity-60 transition-opacity">
                    <p className="text-zinc-400 text-lg mb-1">{item.expression}</p>
                    <p className="text-[#30b134] text-2xl font-semibold">={item.result}</p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-900 flex justify-center">
              <button 
                onClick={() => { playClickSound(); clearHistory(); }}
                className="flex items-center gap-2 text-[#ff4d4d] font-medium py-2 px-6 rounded-full hover:bg-zinc-900 active:scale-95 transition-all"
              >
                <Trash2 size={18} />
                Clear history
              </button>
            </div>
          </div>
        </div>

        {/* Display Area */}
        <div className="flex-1 flex flex-col justify-end p-6 pb-2 overflow-hidden">
          {memory !== 0 && (
            <div className="text-[10px] text-[#30b134] font-bold mb-1 ml-auto uppercase tracking-widest bg-[#30b134]/10 px-2 py-0.5 rounded-sm">
              M: {memory}
            </div>
          )}
          <div className="text-right overflow-x-auto whitespace-nowrap scrollbar-hide">
            <div className={`transition-all duration-300 ease-out break-all font-light tracking-tight ${
              ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(expression) 
                ? 'text-2xl text-[#ff4d4d]' 
                : 'text-5xl md:text-6xl'
            }`}>
              {expression || '0'}
            </div>
          </div>
          <div className="text-right h-12 mt-2">
            {resultPreview && (
              <div className="text-2xl text-zinc-500 font-medium opacity-80 animate-in fade-in slide-in-from-right-4 duration-300">
                {resultPreview}
              </div>
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-900">
          <div className="flex gap-6 items-center">
            <button 
              onClick={() => { playClickSound(); setIsHistoryOpen(true); }} 
              className="text-zinc-500 hover:text-white active:scale-90 transition-all p-1"
            >
              <Clock size={20} />
            </button>
            <button 
              onClick={() => playClickSound()}
              className="text-zinc-500 hover:text-white active:scale-90 transition-all p-1"
            >
              <Ruler size={20} />
            </button>
            <button 
              onClick={() => { playClickSound(); setIsScientificOpen(!isScientificOpen); }} 
              className={`${isScientificOpen ? 'text-[#30b134]' : 'text-zinc-500'} hover:text-white active:scale-90 transition-all p-1`}
            >
              <SquareFunction size={20} />
            </button>
            <button 
              onClick={() => { playClickSound(); setAngleUnit(prev => prev === 'deg' ? 'rad' : 'deg'); }}
              className="px-3 py-1 bg-zinc-900/50 rounded-full text-[10px] font-bold text-zinc-400 hover:text-white active:scale-95 border border-zinc-800 transition-all uppercase tracking-wider"
            >
              {angleUnit}
            </button>
          </div>
          <button 
            onClick={handleBackspace} 
            className="text-[#30b134] hover:opacity-80 active:scale-90 transition-all p-1"
          >
            <Delete size={22} />
          </button>
        </div>

        {/* Keypad Container */}
        <div className={`p-6 pt-4 flex flex-col gap-4 overflow-y-auto scrollbar-hide`}>
          
          {/* Scientific & Memory Row - Toggled */}
          {isScientificOpen && (
            <div className="grid grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <CalcButton label="MC" type={ButtonType.NUMBER} onClick={handleMemoryClear} className="text-xs text-zinc-400 font-bold" />
              <CalcButton label="MR" type={ButtonType.NUMBER} onClick={handleMemoryRecall} className="text-xs text-zinc-400 font-bold" />
              <CalcButton label="M+" type={ButtonType.NUMBER} onClick={handleMemoryAdd} className="text-xs text-zinc-400 font-bold" />
              <CalcButton label="M-" type={ButtonType.NUMBER} onClick={handleMemorySubtract} className="text-xs text-zinc-400 font-bold" />

              <CalcButton label="asin" type={ButtonType.OPERATOR} onClick={() => {}} className="text-[10px] uppercase opacity-30" disabled={true} />
              <CalcButton label="acos" type={ButtonType.OPERATOR} onClick={() => {}} className="text-[10px] uppercase opacity-30" disabled={true} />
              <CalcButton label="atan" type={ButtonType.OPERATOR} onClick={() => {}} className="text-[10px] uppercase opacity-30" disabled={true} />
              <CalcButton label="1/x" type={ButtonType.OPERATOR} onClick={() => {}} className="text-xs opacity-30" disabled={true} />

              <CalcButton label="sin" type={ButtonType.OPERATOR} onClick={() => handleOperator('sin(')} className="text-sm" />
              <CalcButton label="cos" type={ButtonType.OPERATOR} onClick={() => handleOperator('cos(')} className="text-sm" />
              <CalcButton label="tan" type={ButtonType.OPERATOR} onClick={() => handleOperator('tan(')} className="text-sm" />
              <CalcButton label="√" type={ButtonType.OPERATOR} onClick={() => handleOperator('√(')} />
              
              <CalcButton label="log" type={ButtonType.OPERATOR} onClick={() => handleOperator('log(')} className="text-sm" />
              <CalcButton label="ln" type={ButtonType.OPERATOR} onClick={() => handleOperator('ln(')} className="text-sm" />
              <CalcButton label="^" type={ButtonType.OPERATOR} onClick={() => handleOperator('^')} />
              <CalcButton label="π" type={ButtonType.NUMBER} onClick={() => handleInput('π')} />
              
              <CalcButton label="e" type={ButtonType.NUMBER} onClick={() => handleInput('e')} />
              <CalcButton label="(" type={ButtonType.OPERATOR} onClick={() => handleInput('(')} />
              <CalcButton label=")" type={ButtonType.OPERATOR} onClick={() => handleInput(')')} />
              <CalcButton label="!" type={ButtonType.OPERATOR} onClick={() => {}} className="opacity-30 cursor-not-allowed" />
            </div>
          )}

          {/* Standard Keypad */}
          <div className="grid grid-cols-4 gap-4">
            <CalcButton label="C" type={ButtonType.ACTION} onClick={handleClear} />
            <CalcButton label="( )" type={ButtonType.OPERATOR} onClick={() => {
              const openCount = (expression.match(/\(/g) || []).length;
              const closeCount = (expression.match(/\)/g) || []).length;
              if (openCount > closeCount && !/[+\-×÷(]$/.test(expression)) {
                handleInput(')');
              } else {
                handleInput('(');
              }
            }} />
            <CalcButton label="%" type={ButtonType.OPERATOR} onClick={() => handleOperator('%')} />
            <CalcButton label="÷" type={ButtonType.OPERATOR} onClick={() => handleOperator('÷')} />

            <CalcButton label="7" type={ButtonType.NUMBER} onClick={() => handleInput('7')} />
            <CalcButton label="8" type={ButtonType.NUMBER} onClick={() => handleInput('8')} />
            <CalcButton label="9" type={ButtonType.NUMBER} onClick={() => handleInput('9')} />
            <CalcButton label="×" type={ButtonType.OPERATOR} onClick={() => handleOperator('×')} />

            <CalcButton label="4" type={ButtonType.NUMBER} onClick={() => handleInput('4')} />
            <CalcButton label="5" type={ButtonType.NUMBER} onClick={() => handleInput('5')} />
            <CalcButton label="6" type={ButtonType.NUMBER} onClick={() => handleInput('6')} />
            <CalcButton label="-" type={ButtonType.OPERATOR} onClick={() => handleOperator('-')} />

            <CalcButton label="1" type={ButtonType.NUMBER} onClick={() => handleInput('1')} />
            <CalcButton label="2" type={ButtonType.NUMBER} onClick={() => handleInput('2')} />
            <CalcButton label="3" type={ButtonType.NUMBER} onClick={() => handleInput('3')} />
            <CalcButton label="+" type={ButtonType.OPERATOR} onClick={() => handleOperator('+')} />

            <CalcButton label="+/-" type={ButtonType.NUMBER} onClick={() => {
               setExpression(prev => {
                 const isError = ["Invalid format", "Invalid input", "Can't divide by zero", "Value too large", "Error"].includes(prev);
                 const base = isError ? '' : prev;
                 if (base.startsWith('-')) return base.slice(1);
                 if (base === '') return '-';
                 return '-' + base;
               });
            }} />
            <CalcButton label="0" type={ButtonType.NUMBER} onClick={() => handleInput('0')} />
            <CalcButton label="." type={ButtonType.NUMBER} onClick={() => handleInput('.')} />
            <CalcButton label="=" type={ButtonType.EQUALS} onClick={handleEquals} />
          </div>
        </div>

        {/* Bottom indicator */}
        <div className="flex justify-center pb-2 mt-auto shrink-0">
          <div className="w-32 h-1 bg-zinc-800/50 rounded-full"></div>
        </div>
      </div>
    </div>
  );
};

export default App;
