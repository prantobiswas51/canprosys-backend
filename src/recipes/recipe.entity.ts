import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";


@Entity()
export class Recipe{
    @PrimaryGeneratedColumn()
    id!:number;

    // this should come from the product table
    @Column()
    product!:string;

    @Column()
    sizeId!:string;  //e.g. 3x4_wb

    @Column()
    sizeNameBengali!:string; // e.g. ৩ × ৪ ফুট হোয়াইটবোর্ড

    @Column()
    sizeNameEnglish! : string; //e.g. 3 × 4 ft Whiteboard

    //BOM consumption
    @Column()
    woodKg!:string; //e.g. 2.8

    @Column()
    boardSheet!:string; //e.g.  1 piecef

    @Column()
    screwAndHinges!:string; //e.g.  6 piece

    @Column()
    polyBagType!:string; //e.g.  Pieces/Yard (use dropdown select for this)

    @Column()
    polyBagQuantity!:string; //e.g.  4 
    

    //Artisan Wages Rate (Payout - ৳)
    @Column()
    frameMakingRate!: string;  //e.g. 55

    @Column()
    boardFittingRate!: string;  //e.g. 55

    @Column()
    packagingRate!: string;  //e.g. 20

}