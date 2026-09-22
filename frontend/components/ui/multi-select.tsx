import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from 'lucide-react';

export function MultiSelect({ options, selected, onChange, placeholder, className }) {
  const [open, setOpen] = useState(false);

  const handleSelect = (value) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-full justify-between h-10 ${className}`}
        >
          <span className="truncate">
            {selected.length > 0
              ? `${placeholder} (${selected.length})`
              : placeholder}
          </span>
          <div className="flex items-center">
            {selected.length > 0 && (
              <X
                className="w-4 h-4 mr-2 text-gray-500 hover:text-gray-800"
                onClick={handleClear}
              />
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Pesquisar..." />
          <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                onSelect={() => handleSelect(option.value)}
                className="flex items-center cursor-pointer"
              >
                <Checkbox
                  id={`checkbox-${option.value}`}
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => handleSelect(option.value)}
                  className="mr-2"
                />
                <label
                  htmlFor={`checkbox-${option.value}`}
                  className="w-full cursor-pointer"
                >
                  {option.label}
                </label>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}