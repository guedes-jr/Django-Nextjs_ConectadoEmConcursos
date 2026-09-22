import React from "react";

const Collapsible = ({ children, open, onOpenChange }) => {
  return (
    <div className="relative">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { open, onOpenChange });
        }
        return child;
      })}
    </div>
  );
};

const CollapsibleTrigger = ({ children, asChild, open, onOpenChange, ...props }) => {
  const handleClick = () => {
    onOpenChange?.(!open);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: handleClick,
      ...props
    });
  }

  return (
    <button onClick={handleClick} {...props}>
      {children}
    </button>
  );
};

const CollapsibleContent = ({ children, open, className = "" }) => {
  return (
    <div 
      className={`absolute top-full left-0 right-0 z-50 overflow-hidden transition-all duration-200 ${
        open ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
      } ${className}`}
      style={{
        maxHeight: open ? '320px' : '0',
        transition: 'max-height 0.2s ease-in-out, opacity 0.2s ease-in-out'
      }}
    >
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b-lg shadow-lg">
        {children}
      </div>
    </div>
  );
};

export { Collapsible, CollapsibleTrigger, CollapsibleContent };