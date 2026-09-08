import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { RecipeTaskRate } from "./recipe-task-rate.entity";
import { RecipeMaterialUsage } from "./recipe-material-usage.entity";
import { RecipeCategory } from "./recipe-category.entity";


@Entity()
export class Recipe{
    @PrimaryGeneratedColumn()
    id!:number;

    // this should come from the product table
    @Column()
    product!:string;

    @Column({ unique: true })
    sku!:string;  //e.g. 3x4wb

    // Which product grouping this recipe belongs to (Canvas, Easel, ...) --
    // admin-managed via RecipeCategoriesService/its own CRUD, not a hardcoded
    // enum, so new categories can be added later without a code change.
    // Nullable so existing recipes created before this field existed don't
    // need a backfill. No onDelete cascade -- deleting a category still
    // assigned to a recipe should fail loudly (see
    // RecipeCategoriesService.deleteCategory), not silently orphan it.
    @ManyToOne(() => RecipeCategory, { nullable: true })
    @JoinColumn({ name: 'categoryId' })
    category?: RecipeCategory | null;

    @Column({ nullable: true, type: 'int' })
    categoryId?: number | null;

    // Materials (BOM) -- which raw materials this recipe consumes and how
    // much of each per unit produced. Was 5 hardcoded columns (woodKg,
    // boardSheet, screwAndHinges, polyBagType, polyBagQuantity), each
    // resolved to a RawMaterial row by fuzzy name+unit matching at daily
    // entry time; replaced with this pivot, linked directly by RawMaterial
    // id, so any material (not just those 4) can be used and there's no more
    // guessing. Managed as a replace-all set by RecipesService, not TypeORM
    // cascade-save.
    @OneToMany(() => RecipeMaterialUsage, (rmu) => rmu.recipe)
    materialUsages!: RecipeMaterialUsage[];

    // Artisan Wages -- which tasks this recipe uses and what it pays per unit
    // for each one. Was 4 hardcoded columns (frameMakingRate,
    // clothSheetFittingRate, boardFittingRate, packagingRate); replaced with
    // this pivot since recipes don't all use the same tasks. Managed as a
    // replace-all set by RecipesService, not TypeORM cascade-save.
    @OneToMany(() => RecipeTaskRate, (rtr) => rtr.recipe)
    taskRates!: RecipeTaskRate[];

}
