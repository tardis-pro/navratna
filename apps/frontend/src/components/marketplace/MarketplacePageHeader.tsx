import React from 'react';

interface MarketplacePageHeaderProps {
  title: string;
  description: string;
  gradientClassName: string;
  descriptionClassName?: string;
}

export const MarketplacePageHeader: React.FC<MarketplacePageHeaderProps> = ({
  title,
  description,
  gradientClassName,
  descriptionClassName = 'text-lg text-gray-600',
}) => {
  return (
    <div className="text-center space-y-4">
      <h1 className={`text-4xl font-bold bg-clip-text text-transparent ${gradientClassName}`}>
        {title}
      </h1>
      <p className={descriptionClassName}>{description}</p>
    </div>
  );
};
