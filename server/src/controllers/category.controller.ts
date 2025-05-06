import { Request, Response, NextFunction } from "express";
import Category from '../models/category.model'
import { newTrash } from '../controllers/trash.controller'


export const getCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const categories = await Category.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: '_id',
                    foreignField: 'category',
                    as: 'employees'
                }
            },
            {
                $addFields: {
                    employeeCount: { $size: '$employees' }
                }
            },
            {
                $project: {
                    _id: 1,
                    categoryName: 1,
                    role: 1,
                    privileges: 1,
                    employeeCount: 1,
                    isSalespersonWithTarget: 1,
                }
            }
        ]);

        if (categories.length > 0) {
            return res.status(200).json(categories);
        }
        return res.status(204).json();
    } catch (error) {
        console.log(error)
next(error);
    }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const categoryData = req.body;

        const categoryNameLowerCase = categoryData.categoryName.toLowerCase();

        const existingCategory = await Category.findOne({
            categoryName: { $regex: new RegExp('^' + categoryNameLowerCase + '$', 'i') }
        });

        if (existingCategory) {
            if (existingCategory.isDeleted) {
                return res.status(400).json('This category name belongs to a deleted category. Please choose a different name.');
            } else {
                return res.status(400).json('Category name already exists');
            }
        }

        const category = new Category(categoryData);
        const saveCategory = await category.save();

        if (saveCategory) {
            return res.status(200).json(saveCategory);
        }

        return res.status(502).json(saveCategory);
    } catch (error) {
        console.log(error)
next(error);
    }
}

export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const categoryData = req.body;
        const categoryId = req.params.categoryId;

        const categoryNameLowerCase = categoryData.categoryName.toLowerCase();

        const existingCategory = await Category.findOne({
            categoryName: { $regex: new RegExp('^' + categoryNameLowerCase + '$', 'i') },
            _id: { $ne: categoryId },
            isDeleted: { $ne: true }
        });

        if (existingCategory) {
            return res.status(400).json('Category name already exists');
        }

        const categoryUpdated = await Category.findOneAndUpdate(
            {
                _id: categoryId,
                isDeleted: { $ne: true }
            },
            categoryData,
            { new: true }
        );

        if (categoryUpdated) {
            return res.status(200).json(categoryUpdated);
        }

        return res.status(404).json({ message: 'Category not found or already deleted' });
    } catch (error) {
        next(error);
    }
}

export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employee } = req.body;

        // Check if category exists and isn't already deleted
        const category = await Category.findOne({
            _id: dataId,
        });

        if (!category) {
            return res.status(404).json({
                message: 'Category not found or already deleted'
            });
        }

        // Soft delete the category
        await Category.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('Category', dataId, employee)

        return res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.log(error)
next(error);
    }
}
