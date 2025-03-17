import React, { useState } from 'react';
import { 
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { isOpenAIApiKeyConfigured, getOpenAIApiKey } from "@/lib/config/env";

export interface ChildSettings {
  name: string;
  age: string;
  gender: 'boy' | 'girl' | 'other';
  language: 'english' | 'german';
  apiKey: string;
}

interface SettingsPanelProps {
  settings: ChildSettings;
  onSettingsChange: (settings: ChildSettings) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  settings, 
  onSettingsChange 
}) => {
  const [formState, setFormState] = useState<ChildSettings>(settings);
  const envApiKey = getOpenAIApiKey();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleGenderChange = (value: 'boy' | 'girl' | 'other') => {
    setFormState(prev => ({ ...prev, gender: value }));
  };

  const handleLanguageChange = (value: 'english' | 'german') => {
    setFormState(prev => ({ ...prev, language: value }));
  };

  const handleSave = () => {
    onSettingsChange(formState);
    toast.success("Settings saved!");
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="absolute top-4 right-4 rounded-full bg-glass border-none"
        >
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="rounded-t-3xl">
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle className="text-2xl text-center font-bold">Settings</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-base">Child's Name</Label>
              <Input 
                id="name" 
                name="name"
                placeholder="Enter name" 
                value={formState.name}
                onChange={handleChange}
                className="rounded-xl h-12 border-kids-blue focus:ring-kids-blue"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="age" className="text-base">Child's Age</Label>
              <Input 
                id="age" 
                name="age"
                type="number" 
                placeholder="Enter age" 
                value={formState.age}
                onChange={handleChange}
                className="rounded-xl h-12 border-kids-blue focus:ring-kids-blue"
                min="1"
                max="12"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-base">Child's Gender</Label>
              <RadioGroup 
                value={formState.gender} 
                onValueChange={handleGenderChange as (value: string) => void}
                className="flex space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="boy" id="boy" className="text-kids-blue" />
                  <Label htmlFor="boy">Boy</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="girl" id="girl" className="text-kids-blue" />
                  <Label htmlFor="girl">Girl</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="other" id="other" className="text-kids-blue" />
                  <Label htmlFor="other">Other</Label>
                </div>
              </RadioGroup>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="language" className="text-base">Language</Label>
              <Select 
                value={formState.language} 
                onValueChange={handleLanguageChange as (value: string) => void}
              >
                <SelectTrigger 
                  id="language" 
                  className="rounded-xl h-12 border-kids-blue focus:ring-kids-blue"
                >
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="english">English</SelectItem>
                  <SelectItem value="german">German</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {!isOpenAIApiKeyConfigured() && (
              <div className="space-y-2">
                <Label htmlFor="apiKey" className="text-base">OpenAI API Key</Label>
                <Input 
                  id="apiKey" 
                  name="apiKey"
                  type="password"
                  placeholder="Enter your OpenAI API Key" 
                  value={formState.apiKey}
                  onChange={handleChange}
                  className="rounded-xl h-12 border-kids-blue focus:ring-kids-blue"
                />
                <p className="text-xs text-gray-500">
                  Your API key is stored locally in your browser and never sent to our servers.
                  For production, please set the VITE_OPENAI_API_KEY environment variable.
                </p>
              </div>
            )}
          </div>
          <DrawerFooter>
            <Button 
              onClick={handleSave}
              className="rounded-xl h-12 bg-kids-green hover:bg-kids-green/90 text-white font-medium"
            >
              Save Settings
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default SettingsPanel;
